/**
 * #14 document metadata rules: create + soft-delete for owner/admin/pm with
 * department need-to-know enforced (you can never create or delete a document
 * you couldn't see); storagePath pinned to the project's own prefix; the only
 * permitted update is the pinned soft-delete triple; hard delete denied; list
 * queries must constrain restrictedToDepartments (need-to-know) — the
 * deletedAt filter is a client convention, not rules-enforced.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const DOCS_PATH = `workspaces/${WKS_A}/projects/proj1/documents`;
const DOC_PATH = `${DOCS_PATH}/doc1`;
const RESTRICTED_DOC_PATH = `${DOCS_PATH}/doc-fin`;

const DEP_FINANCE = 'dep-finance';
const DEP_SITE = 'dep-site';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-documents');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
});

beforeEach(async () => {
  await seedDoc(testEnv, DOC_PATH, validDocument('doc1'));
  await seedDoc(
    testEnv,
    RESTRICTED_DOC_PATH,
    validDocument('doc-fin', { restrictedToDepartments: [DEP_FINANCE] }),
  );
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A, departments: string[] = []) {
  return testEnv
    .authenticatedContext(`user-${role}`, { ...memberClaims(wid, role, departments) })
    .firestore();
}

/** Firestore as a portal client principal (claims shape redeemPortalLink mints). */
function dbAsPortal(pid: string = 'proj1', wid: string = WKS_A, cid: string = 'client1') {
  return testEnv
    .authenticatedContext(`portal_${wid}_${pid}_${cid}`, {
      portal: { wid, pid, cid, linkId: 'link1' },
    })
    .firestore();
}

/** Firestore as a collaborator principal (claims shape redeemCollabLink mints). */
function dbAsCollab(wid: string = WKS_A, colid: string = 'col1') {
  return testEnv
    .authenticatedContext(`collab_${wid}_${colid}`, {
      collab: { wid, colid, linkId: 'link1' },
    })
    .firestore();
}

/** A document doc that passes the #14 create rule for `user-<role>` callers. */
function validDocument(
  id: string,
  extra: Record<string, unknown> = {},
  uploader = 'user-owner',
): Record<string, unknown> {
  return {
    id,
    name: 'site-plan.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storagePath: `workspaces/${WKS_A}/projects/proj1/uuid-site-plan.pdf`,
    scope: 'project',
    scopeId: 'proj1',
    uploadedBy: uploader,
    uploaderType: 'firm_member',
    uploadedAt: Timestamp.now(),
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    scanStatus: 'pending',
    deletedAt: null,
    ...extra,
  };
}

/** A Google Drive link doc that passes the D-043 link-create rule (task-scoped). */
function validLinkDocument(
  id: string,
  extra: Record<string, unknown> = {},
  uploader = 'user-owner',
): Record<string, unknown> {
  return {
    id,
    name: 'Rebar spec (Drive)',
    attachmentType: 'link',
    url: 'https://drive.google.com/file/d/abc123/view',
    linkProvider: 'google_drive',
    scope: 'task',
    scopeId: 'task1',
    uploadedBy: uploader,
    uploaderType: 'firm_member',
    uploadedAt: Timestamp.now(),
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    scanStatus: 'clean',
    deletedAt: null,
    ...extra,
  };
}

describe('document create', () => {
  it('allows owner, admin and pm to create a valid document', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `${DOCS_PATH}/doc-${role}`),
          validDocument(`doc-${role}`, {}, `user-${role}`),
        ),
      );
    }
  });

  it('denies viewer creating documents', async () => {
    await assertFails(
      setDoc(doc(dbAs('viewer'), `${DOCS_PATH}/doc-v`), validDocument('doc-v', {}, 'user-viewer')),
    );
  });

  it('denies cross-workspace create even for an owner', async () => {
    await assertFails(
      setDoc(doc(dbAs('owner', WKS_B), `${DOCS_PATH}/doc-x`), validDocument('doc-x')),
    );
  });

  it('denies create with a spoofed uploadedBy', async () => {
    await assertFails(
      setDoc(doc(dbAs('admin'), `${DOCS_PATH}/doc-x`), validDocument('doc-x', {}, 'someone-else')),
    );
  });

  it('denies create with uploaderType client or a non-pending scanStatus', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { uploaderType: 'client' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { scanStatus: 'clean' }),
      ),
    );
  });

  it('denies create over the 25 MB size cap or with a non-positive size', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { sizeBytes: 25 * 1024 * 1024 + 1 }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { sizeBytes: 0 }),
      ),
    );
  });

  it('denies create with a storagePath outside the project prefix', async () => {
    const badPaths = [
      `workspaces/${WKS_B}/projects/proj1/uuid-file.pdf`,
      `workspaces/${WKS_A}/projects/other-proj/uuid-file.pdf`,
      `workspaces/${WKS_A}/projects/proj1/client-uploads/uuid-file.pdf`,
    ];
    for (const storagePath of badPaths) {
      await assertFails(
        setDoc(doc(dbAs('owner'), `${DOCS_PATH}/doc-x`), validDocument('doc-x', { storagePath })),
      );
    }
  });

  it('denies create with extra keys (retentionUntil is server-only)', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { retentionUntil: Timestamp.now() }),
      ),
    );
  });

  it('denies create without an explicit null deletedAt', async () => {
    const withoutDeletedAt = { ...validDocument('doc-x') };
    delete withoutDeletedAt['deletedAt'];
    await assertFails(setDoc(doc(dbAs('owner'), `${DOCS_PATH}/doc-x`), withoutDeletedAt));
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { deletedAt: Timestamp.now() }),
      ),
    );
  });

  it('denies create with a non-empty visibleToCollaboratorIds', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { visibleToCollaboratorIds: ['col1'] }),
      ),
    );
  });

  it('denies create with an id mismatching the doc id', async () => {
    await assertFails(setDoc(doc(dbAs('owner'), `${DOCS_PATH}/doc-x`), validDocument('other-id')));
  });

  it('enforces need-to-know on create for pm: foreign department denied, own allowed', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_SITE]), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { restrictedToDepartments: [DEP_FINANCE] }, 'user-pm'),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_FINANCE]), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { restrictedToDepartments: [DEP_FINANCE] }, 'user-pm'),
      ),
    );
  });

  it('denies task-scoped create with an empty scopeId, allows a real one', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { scope: 'task', scopeId: '' }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-t`),
        validDocument('doc-t', { scope: 'task', scopeId: 'task1' }),
      ),
    );
  });

  it('denies project-scoped create where scopeId is not the project id', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/doc-x`),
        validDocument('doc-x', { scope: 'project', scopeId: 'other-proj' }),
      ),
    );
  });

  it('still allows a legacy file create with no attachmentType field (backward compat)', async () => {
    // The file-create path never writes attachmentType; mapDocument defaults
    // it to 'file' at read time. Confirm the rule ignores its absence.
    const payload = validDocument('doc-file');
    expect('attachmentType' in payload).toBe(false);
    await assertSucceeds(setDoc(doc(dbAs('owner'), `${DOCS_PATH}/doc-file`), payload));
  });
});

describe('link document create (D-043)', () => {
  it('allows owner, admin and pm to create a valid Drive link doc (both hosts)', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `${DOCS_PATH}/lnk-${role}`),
          validLinkDocument(`lnk-${role}`, {}, `user-${role}`),
        ),
      );
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `${DOCS_PATH}/lnk-docs-${role}`),
          validLinkDocument(
            `lnk-docs-${role}`,
            { url: 'https://docs.google.com/document/d/abc123/edit' },
            `user-${role}`,
          ),
        ),
      );
    }
  });

  it('denies a link doc carrying file-only keys (storagePath/sizeBytes/mimeType)', async () => {
    for (const extra of [
      { storagePath: `workspaces/${WKS_A}/projects/proj1/uuid-x.pdf` },
      { sizeBytes: 1024 },
      { mimeType: 'application/pdf' },
    ]) {
      await assertFails(
        setDoc(doc(dbAs('owner'), `${DOCS_PATH}/lnk-x`), validLinkDocument('lnk-x', extra)),
      );
    }
  });

  it('denies a non-Drive host or an http:// url', async () => {
    for (const url of [
      'https://evil.com/file/d/abc123',
      'http://drive.google.com/file/d/abc123',
      'https://drive.google.com.evil.com/x',
      'ftp://drive.google.com/x',
    ]) {
      await assertFails(
        setDoc(doc(dbAs('owner'), `${DOCS_PATH}/lnk-x`), validLinkDocument('lnk-x', { url })),
      );
    }
  });

  it('denies a scanStatus other than clean', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-x`),
        validLinkDocument('lnk-x', { scanStatus: 'pending' }),
      ),
    );
  });

  it('denies a linkProvider other than google_drive', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-x`),
        validLinkDocument('lnk-x', { linkProvider: 'dropbox' }),
      ),
    );
  });

  it('denies a project-scoped link doc (task scope only at MVP)', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-x`),
        validLinkDocument('lnk-x', { scope: 'project', scopeId: 'proj1' }),
      ),
    );
  });

  it('denies a link doc with a non-empty visibleToCollaboratorIds', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-x`),
        validLinkDocument('lnk-x', { visibleToCollaboratorIds: ['col1'] }),
      ),
    );
  });

  it('denies a spoofed uploadedBy or a non-firm uploaderType', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-x`),
        validLinkDocument('lnk-x', {}, 'someone-else'),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-x`),
        validLinkDocument('lnk-x', { uploaderType: 'client' }),
      ),
    );
  });

  it('enforces need-to-know: pm cannot create a link restricted to a department they lack', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_SITE]), `${DOCS_PATH}/lnk-x`),
        validLinkDocument('lnk-x', { restrictedToDepartments: [DEP_FINANCE] }, 'user-pm'),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_FINANCE]), `${DOCS_PATH}/lnk-ok`),
        validLinkDocument('lnk-ok', { restrictedToDepartments: [DEP_FINANCE] }, 'user-pm'),
      ),
    );
  });

  it('denies a viewer and a non-member from creating a link doc', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('viewer'), `${DOCS_PATH}/lnk-x`),
        validLinkDocument('lnk-x', {}, 'user-viewer'),
      ),
    );
    // Owner of a different workspace is a non-member here (cross-workspace).
    await assertFails(
      setDoc(doc(dbAs('owner', WKS_B), `${DOCS_PATH}/lnk-x`), validLinkDocument('lnk-x')),
    );
  });

  it('denies a portal client and a collaborator from creating a link doc', async () => {
    await assertFails(
      setDoc(doc(dbAsPortal(), `${DOCS_PATH}/lnk-x`), validLinkDocument('lnk-x', {}, 'portal-user')),
    );
    await assertFails(
      setDoc(doc(dbAsCollab(), `${DOCS_PATH}/lnk-x`), validLinkDocument('lnk-x', {}, 'collab-user')),
    );
  });
});

describe('link document soft delete + hard delete (D-043)', () => {
  const LINK_PATH = `${DOCS_PATH}/lnk-del`;

  beforeEach(async () => {
    await seedDoc(testEnv, LINK_PATH, validLinkDocument('lnk-del'));
  });

  it('allows a permitted firm member to soft-delete a link doc', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('pm'), LINK_PATH), {
        deletedAt: Timestamp.now(),
        deletedBy: 'user-pm',
        deletedByType: 'firm_member',
      }),
    );
  });

  it('denies hard delete of a link doc for every role', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertFails(deleteDoc(doc(dbAs(role), LINK_PATH)));
    }
  });
});

describe('document soft delete (update)', () => {
  function softDelete(uid: string) {
    return {
      deletedAt: Timestamp.now(),
      deletedBy: uid,
      deletedByType: 'firm_member',
    };
  }

  it('allows owner, admin and pm to soft-delete', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await seedDoc(testEnv, DOC_PATH, validDocument('doc1'));
      await assertSucceeds(updateDoc(doc(dbAs(role), DOC_PATH), softDelete(`user-${role}`)));
    }
  });

  it('denies viewer soft-deleting', async () => {
    await assertFails(updateDoc(doc(dbAs('viewer'), DOC_PATH), softDelete('user-viewer')));
  });

  it('denies a spoofed deletedBy or wrong deletedByType', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), DOC_PATH), {
        ...softDelete('someone-else'),
      }),
    );
    await assertFails(
      updateDoc(doc(dbAs('owner'), DOC_PATH), {
        ...softDelete('user-owner'),
        deletedByType: 'client',
      }),
    );
  });

  it('denies updates touching anything beyond the soft-delete triple', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), DOC_PATH), { name: 'renamed.pdf' }),
    );
    await assertFails(
      updateDoc(doc(dbAs('owner'), DOC_PATH), { scanStatus: 'clean' }),
    );
    await assertFails(
      updateDoc(doc(dbAs('owner'), DOC_PATH), {
        ...softDelete('user-owner'),
        name: 'renamed.pdf',
      }),
    );
  });

  it('denies double soft-delete', async () => {
    await seedDoc(
      testEnv,
      DOC_PATH,
      validDocument('doc1', {
        deletedAt: Timestamp.now(),
        deletedBy: 'user-owner',
        deletedByType: 'firm_member',
      }),
    );
    await assertFails(updateDoc(doc(dbAs('owner'), DOC_PATH), softDelete('user-owner')));
  });

  it('enforces need-to-know on soft delete for pm', async () => {
    await assertFails(
      updateDoc(doc(dbAs('pm', WKS_A, [DEP_SITE]), RESTRICTED_DOC_PATH), softDelete('user-pm')),
    );
    await assertSucceeds(
      updateDoc(doc(dbAs('pm', WKS_A, [DEP_FINANCE]), RESTRICTED_DOC_PATH), softDelete('user-pm')),
    );
  });
});

describe('document hard delete', () => {
  it('denies delete for every role', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertFails(deleteDoc(doc(dbAs(role), DOC_PATH)));
    }
  });
});

describe('document list queries (need-to-know)', () => {
  it('allows the unrestricted + not-deleted query for viewer', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(dbAs('viewer'), DOCS_PATH),
          where('restrictedToDepartments', '==', []),
          where('deletedAt', '==', null),
        ),
      ),
    );
  });

  it('allows the per-department query for an in-department pm', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(dbAs('pm', WKS_A, [DEP_FINANCE]), DOCS_PATH),
          where('restrictedToDepartments', 'array-contains', DEP_FINANCE),
          where('deletedAt', '==', null),
        ),
      ),
    );
  });

  it('denies unconstrained list for pm and viewer, allows it for owner', async () => {
    await assertFails(getDocs(collection(dbAs('pm'), DOCS_PATH)));
    await assertFails(getDocs(collection(dbAs('viewer'), DOCS_PATH)));
    await assertSucceeds(getDocs(collection(dbAs('owner'), DOCS_PATH)));
  });
});
