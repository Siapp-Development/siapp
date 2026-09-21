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
    // Visibility now pins to the parent task (D-043): seed a task actually
    // restricted to finance so an inherited [DEP_FINANCE] link is a valid
    // shape, and need-to-know (canSeeRestricted) is the only gate under test.
    await seedDoc(testEnv, `workspaces/${WKS_A}/projects/proj1/tasks/task-fin`, {
      id: 'task-fin',
      visibleToClient: false,
      restrictedToDepartments: [DEP_FINANCE],
    });
    await assertFails(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_SITE]), `${DOCS_PATH}/lnk-x`),
        validLinkDocument(
          'lnk-x',
          { scopeId: 'task-fin', restrictedToDepartments: [DEP_FINANCE] },
          'user-pm',
        ),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_FINANCE]), `${DOCS_PATH}/lnk-ok`),
        validLinkDocument(
          'lnk-ok',
          { scopeId: 'task-fin', restrictedToDepartments: [DEP_FINANCE] },
          'user-pm',
        ),
      ),
    );
  });

  it('denies a link whose visibleToClient does not match the parent task (both directions)', async () => {
    // Direction 1 — task false, doc true. `task1` is seeded (seedWorkspace)
    // without a visibleToClient field, so task.get('visibleToClient', false)
    // is false; a doc claiming client-visible mismatches.
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-vis`),
        validLinkDocument('lnk-vis', { visibleToClient: true }),
      ),
    );
    // Direction 2 — task true, doc false. Pin a client-visible task and submit
    // a firm-internal link against it: the visibility now mismatches downward.
    await seedDoc(testEnv, `workspaces/${WKS_A}/projects/proj1/tasks/task-vis`, {
      id: 'task-vis',
      visibleToClient: true,
      restrictedToDepartments: [],
    });
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-invis`),
        validLinkDocument('lnk-invis', { scopeId: 'task-vis', visibleToClient: false }),
      ),
    );
  });

  it('denies a link whose restrictedToDepartments does not match the parent task', async () => {
    // `task1` has no restrictedToDepartments → default []; a link carrying a
    // non-empty department set no longer matches the task's (empty) array.
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-rd`),
        validLinkDocument('lnk-rd', { restrictedToDepartments: [DEP_SITE] }),
      ),
    );
    // And the reverse: a task actually restricted to finance rejects a link
    // that drops the restriction (owner can see everything, so need-to-know is
    // satisfied — only the pinned-array check fails).
    await seedDoc(testEnv, `workspaces/${WKS_A}/projects/proj1/tasks/task-rd`, {
      id: 'task-rd',
      visibleToClient: false,
      restrictedToDepartments: [DEP_FINANCE],
    });
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-rd2`),
        validLinkDocument('lnk-rd2', { scopeId: 'task-rd', restrictedToDepartments: [] }),
      ),
    );
  });

  it('denies a link whose scopeId points at a non-existent task', async () => {
    // The rule get()s the task at the submitted scopeId; a missing task makes
    // the pinned-visibility read fail, so the create is denied.
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-orphan`),
        validLinkDocument('lnk-orphan', { scopeId: 'no-such-task' }),
      ),
    );
  });

  it('allows a link that inherits a client-visible task exactly', async () => {
    await seedDoc(testEnv, `workspaces/${WKS_A}/projects/proj1/tasks/task-client`, {
      id: 'task-client',
      visibleToClient: true,
      restrictedToDepartments: [],
    });
    await assertSucceeds(
      setDoc(
        doc(dbAs('owner'), `${DOCS_PATH}/lnk-client`),
        validLinkDocument('lnk-client', { scopeId: 'task-client', visibleToClient: true }),
      ),
    );
  });

  it('allows a link that inherits a department-restricted task the actor can see', async () => {
    await seedDoc(testEnv, `workspaces/${WKS_A}/projects/proj1/tasks/task-dep`, {
      id: 'task-dep',
      visibleToClient: false,
      restrictedToDepartments: [DEP_SITE],
    });
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_SITE]), `${DOCS_PATH}/lnk-dep`),
        validLinkDocument(
          'lnk-dep',
          { scopeId: 'task-dep', restrictedToDepartments: [DEP_SITE] },
          'user-pm',
        ),
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

/**
 * #168 — clients and collaborators may soft-delete ONLY their own uploads
 * (never firm-, peer-, or link-authored docs), diff-locked to the soft-delete
 * triple, blocked on read_only billing, and never a hard delete. The firm
 * branch remains byte-for-byte the prior behaviour (regressed here).
 *
 * These cases live on a dedicated live project (proj168) with its own tasks so
 * they never disturb the firm create/delete fixtures that key off proj1/task1.
 */
describe('client and collaborator self-delete (#168)', () => {
  const CID = 'client1'; // matches dbAsPortal() default cid
  const OTHER_CID = 'client-other';
  const COLID = 'col1'; // matches dbAsCollab() default colid
  const OTHER_COL = 'col-other';
  const PROJ = 'proj168';
  const RO_WKS = 'wksRO'; // billing read_only workspace mirror
  const TASK_ASSIGNED = 'task168-assigned'; // col1 is an assignee
  const TASK_UNASSIGNED = 'task168-unassigned'; // col1 is NOT an assignee

  const DOCS = `workspaces/${WKS_A}/projects/${PROJ}/documents`;
  const RO_DOCS = `workspaces/${RO_WKS}/projects/${PROJ}/documents`;

  const CLIENT_OWN = `${DOCS}/cli-own`; // uploaderType client, uploadedBy client1
  const CLIENT_OTHER = `${DOCS}/cli-other`; // uploaderType client, uploadedBy client-other
  const FIRM_FILE = `${DOCS}/firm-file`; // uploaderType firm_member (file)
  const FIRM_LINK = `${DOCS}/firm-link`; // uploaderType firm_member (Drive link)
  const COLLAB_OWN = `${DOCS}/col-own`; // collaborator col1, on an assigned task
  const COLLAB_OWN_UNASSIGNED = `${DOCS}/col-own-unassigned`; // col1 upload, task not assigned
  const COLLAB_PEER = `${DOCS}/col-peer`; // collaborator col-other
  const CLIENT_LINK = `${DOCS}/cli-link`; // client-authored EXTERNAL Drive link (not a file)
  const COLLAB_LINK = `${DOCS}/col-link`; // collaborator-authored EXTERNAL Drive link (not a file)
  const CLIENT_OWN_FILE = `${DOCS}/cli-own-file`; // client upload with explicit attachmentType 'file'

  /** A client-uploaded file doc (soft-deletable by its owning client). */
  function clientFile(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return validDocument(id, {
      uploaderType: 'client',
      uploadedBy: CID,
      scope: 'project',
      scopeId: PROJ,
      visibleToClient: true,
      storagePath: `workspaces/${WKS_A}/projects/${PROJ}/client-uploads/uuid-${id}.png`,
      ...extra,
    });
  }

  /** A collaborator-uploaded file doc scoped to the assigned task. */
  function collabFile(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return validDocument(id, {
      uploaderType: 'collaborator',
      uploadedBy: COLID,
      scope: 'task',
      scopeId: TASK_ASSIGNED,
      visibleToCollaboratorIds: [COLID],
      storagePath: `workspaces/${WKS_A}/projects/${PROJ}/collab-uploads/uuid-${id}.png`,
      ...extra,
    });
  }

  /**
   * A client-authored doc that is an EXTERNAL Drive link (attachmentType 'link'),
   * carrying the correct client self-delete triple ownership but NOT a file row.
   */
  function clientLink(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return clientFile(id, {
      attachmentType: 'link',
      url: 'https://drive.google.com/file/d/cli-abc123/view',
      linkProvider: 'google_drive',
      ...extra,
    });
  }

  /**
   * A collaborator-authored doc that is an EXTERNAL Drive link (attachmentType
   * 'link'), on an assigned task and owned by col1, but NOT a file row.
   */
  function collabLink(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return collabFile(id, {
      attachmentType: 'link',
      url: 'https://drive.google.com/file/d/col-abc123/view',
      linkProvider: 'google_drive',
      ...extra,
    });
  }

  /** Task doc shaped so `collabAssignedTaskAt` resolves col1 as an assignee. */
  function collabTask(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id,
      title: 'Install rebar',
      visibleToClient: false,
      visibleToCollaboratorIds: [],
      restrictedToDepartments: [],
      assigneeCollaboratorIds: [COLID],
      ...extra,
    };
  }

  const clientDelete = () => ({
    deletedAt: Timestamp.now(),
    deletedBy: CID,
    deletedByType: 'client',
  });
  const collabDelete = (colid: string = COLID) => ({
    deletedAt: Timestamp.now(),
    deletedBy: colid,
    deletedByType: 'collaborator',
  });
  const firmDelete = (uid: string) => ({
    deletedAt: Timestamp.now(),
    deletedBy: uid,
    deletedByType: 'firm_member',
  });

  beforeAll(async () => {
    // Live project in the active workspace, with its own tasks.
    await seedDoc(testEnv, `workspaces/${WKS_A}/projects/${PROJ}`, {
      lifecycle: 'published',
      clientId: CID,
      clientIds: [CID],
    });
    await seedDoc(
      testEnv,
      `workspaces/${WKS_A}/projects/${PROJ}/tasks/${TASK_ASSIGNED}`,
      collabTask(TASK_ASSIGNED),
    );
    await seedDoc(
      testEnv,
      `workspaces/${WKS_A}/projects/${PROJ}/tasks/${TASK_UNASSIGNED}`,
      collabTask(TASK_UNASSIGNED, { assigneeCollaboratorIds: [OTHER_COL] }),
    );

    // Read-only (billing) workspace mirror: same live project + assigned task.
    await seedDoc(testEnv, `workspaces/${RO_WKS}`, { billingStatus: 'read_only' });
    await seedDoc(testEnv, `workspaces/${RO_WKS}/projects/${PROJ}`, {
      lifecycle: 'published',
      clientId: CID,
      clientIds: [CID],
    });
    await seedDoc(
      testEnv,
      `workspaces/${RO_WKS}/projects/${PROJ}/tasks/${TASK_ASSIGNED}`,
      collabTask(TASK_ASSIGNED),
    );
  });

  beforeEach(async () => {
    await seedDoc(testEnv, CLIENT_OWN, clientFile('cli-own'));
    await seedDoc(testEnv, CLIENT_OTHER, clientFile('cli-other', { uploadedBy: OTHER_CID }));
    await seedDoc(
      testEnv,
      FIRM_FILE,
      validDocument('firm-file', { scope: 'task', scopeId: TASK_ASSIGNED, visibleToClient: true }),
    );
    await seedDoc(testEnv, FIRM_LINK, validLinkDocument('firm-link', { scopeId: TASK_ASSIGNED }));
    await seedDoc(testEnv, COLLAB_OWN, collabFile('col-own'));
    await seedDoc(
      testEnv,
      COLLAB_OWN_UNASSIGNED,
      collabFile('col-own-unassigned', { scopeId: TASK_UNASSIGNED }),
    );
    await seedDoc(
      testEnv,
      COLLAB_PEER,
      collabFile('col-peer', { uploadedBy: OTHER_COL, visibleToCollaboratorIds: [OTHER_COL] }),
    );
    // #168 link-hardening fixtures: client- and collaborator-authored EXTERNAL
    // Drive links (attachmentType 'link') that carry the correct ownership.
    await seedDoc(testEnv, CLIENT_LINK, clientLink('cli-link'));
    await seedDoc(testEnv, COLLAB_LINK, collabLink('col-link'));
    // Client upload with the attachmentType discriminator set explicitly to 'file'.
    await seedDoc(testEnv, CLIENT_OWN_FILE, clientFile('cli-own-file', { attachmentType: 'file' }));
    // Read-only workspace mirror docs.
    await seedDoc(testEnv, `${RO_DOCS}/cli-own`, clientFile('cli-own'));
    await seedDoc(testEnv, `${RO_DOCS}/col-own`, collabFile('col-own'));
  });

  // ---- ALLOW -------------------------------------------------------------
  it('allows a portal client to soft-delete their own upload', async () => {
    await assertSucceeds(updateDoc(doc(dbAsPortal(PROJ), CLIENT_OWN), clientDelete()));
  });

  it('allows a collaborator to soft-delete their own upload on an assigned task', async () => {
    await assertSucceeds(updateDoc(doc(dbAsCollab(), COLLAB_OWN), collabDelete()));
  });

  it('allows a portal client to soft-delete an own upload with attachmentType set to file (#168)', async () => {
    // Guards the explicit-discriminator path: attachmentType == 'file' is deletable.
    await assertSucceeds(updateDoc(doc(dbAsPortal(PROJ), CLIENT_OWN_FILE), clientDelete()));
  });

  it('allows a portal client to soft-delete a legacy own upload with attachmentType absent (#168)', async () => {
    // CLIENT_OWN is seeded via validDocument, which never writes attachmentType;
    // the rule falls back to get('attachmentType', 'file') == 'file' for legacy
    // file rows, so the self-delete must still succeed.
    await seedDoc(testEnv, CLIENT_OWN, clientFile('cli-own'));
    await assertSucceeds(updateDoc(doc(dbAsPortal(PROJ), CLIENT_OWN), clientDelete()));
  });

  it('still allows a firm member to soft-delete an external Drive link (#168, firm branch unaffected)', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('owner'), FIRM_LINK), firmDelete('user-owner')));
  });

  it('still allows firm owner/admin/pm to soft-delete (regression)', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await seedDoc(
        testEnv,
        FIRM_FILE,
        validDocument('firm-file', {
          scope: 'task',
          scopeId: TASK_ASSIGNED,
          visibleToClient: true,
        }),
      );
      await assertSucceeds(updateDoc(doc(dbAs(role), FIRM_FILE), firmDelete(`user-${role}`)));
    }
  });

  // ---- DENY: client deleting non-own rows ---------------------------------
  it('denies a client deleting a firm-uploaded file or a Drive link', async () => {
    await assertFails(updateDoc(doc(dbAsPortal(PROJ), FIRM_FILE), clientDelete()));
    await assertFails(updateDoc(doc(dbAsPortal(PROJ), FIRM_LINK), clientDelete()));
  });

  it("denies a client deleting another client's upload", async () => {
    await assertFails(updateDoc(doc(dbAsPortal(PROJ), CLIENT_OTHER), clientDelete()));
  });

  it('denies a client soft-deleting their OWN external Drive link (#168 link hardening)', async () => {
    // Correct client self-delete triple + own upload, but attachmentType 'link'
    // (an external Drive link) must never be client self-deletable.
    await assertFails(updateDoc(doc(dbAsPortal(PROJ), CLIENT_LINK), clientDelete()));
  });

  // ---- DENY: collaborator deleting non-own / unassigned rows --------------
  it('denies a collaborator deleting a firm, client, or peer-collaborator doc', async () => {
    await assertFails(updateDoc(doc(dbAsCollab(), FIRM_FILE), collabDelete()));
    await assertFails(updateDoc(doc(dbAsCollab(), CLIENT_OWN), collabDelete()));
    await assertFails(updateDoc(doc(dbAsCollab(), COLLAB_PEER), collabDelete()));
  });

  it('denies a collaborator deleting their own upload on a task they are NOT assigned to', async () => {
    await assertFails(updateDoc(doc(dbAsCollab(), COLLAB_OWN_UNASSIGNED), collabDelete()));
  });

  it('denies a collaborator soft-deleting their OWN external Drive link (#168 link hardening)', async () => {
    // Correct collaborator self-delete triple, own upload, assigned task — but
    // attachmentType 'link' (external Drive link) must never be self-deletable.
    await assertFails(updateDoc(doc(dbAsCollab(), COLLAB_LINK), collabDelete()));
  });

  // ---- DENY: mismatched deletedByType / spoofed deletedBy -----------------
  it('denies a client writing deletedByType firm_member', async () => {
    await assertFails(
      updateDoc(doc(dbAsPortal(PROJ), CLIENT_OWN), {
        deletedAt: Timestamp.now(),
        deletedBy: CID,
        deletedByType: 'firm_member',
      }),
    );
  });

  it('denies a collaborator writing deletedByType client', async () => {
    await assertFails(
      updateDoc(doc(dbAsCollab(), COLLAB_OWN), {
        deletedAt: Timestamp.now(),
        deletedBy: COLID,
        deletedByType: 'client',
      }),
    );
  });

  it('denies a client spoofing deletedBy to a different id', async () => {
    await assertFails(
      updateDoc(doc(dbAsPortal(PROJ), CLIENT_OWN), {
        deletedAt: Timestamp.now(),
        deletedBy: 'someone-else',
        deletedByType: 'client',
      }),
    );
  });

  it('denies a collaborator spoofing deletedBy to a different id', async () => {
    await assertFails(
      updateDoc(doc(dbAsCollab(), COLLAB_OWN), {
        deletedAt: Timestamp.now(),
        deletedBy: OTHER_COL,
        deletedByType: 'collaborator',
      }),
    );
  });

  // ---- DENY: diff outside the triple --------------------------------------
  it('denies a self-delete that also touches a key outside the triple', async () => {
    await assertFails(
      updateDoc(doc(dbAsPortal(PROJ), CLIENT_OWN), { ...clientDelete(), name: 'renamed.png' }),
    );
    await assertFails(
      updateDoc(doc(dbAsCollab(), COLLAB_OWN), { ...collabDelete(), name: 'renamed.png' }),
    );
  });

  it('denies a client flipping visibleToClient (no soft-delete keys)', async () => {
    await assertFails(updateDoc(doc(dbAsPortal(PROJ), CLIENT_OWN), { visibleToClient: false }));
  });

  // ---- DENY: double soft-delete -------------------------------------------
  it('denies a double soft-delete (deletedAt already set) for client and collaborator', async () => {
    await seedDoc(
      testEnv,
      CLIENT_OWN,
      clientFile('cli-own', { deletedAt: Timestamp.now(), deletedBy: CID, deletedByType: 'client' }),
    );
    await assertFails(updateDoc(doc(dbAsPortal(PROJ), CLIENT_OWN), clientDelete()));

    await seedDoc(
      testEnv,
      COLLAB_OWN,
      collabFile('col-own', {
        deletedAt: Timestamp.now(),
        deletedBy: COLID,
        deletedByType: 'collaborator',
      }),
    );
    await assertFails(updateDoc(doc(dbAsCollab(), COLLAB_OWN), collabDelete()));
  });

  // ---- DENY: read_only billing gate ---------------------------------------
  it('denies self-delete on a read_only workspace for client and collaborator', async () => {
    await assertFails(updateDoc(doc(dbAsPortal(PROJ, RO_WKS, CID), `${RO_DOCS}/cli-own`), clientDelete()));
    await assertFails(updateDoc(doc(dbAsCollab(RO_WKS), `${RO_DOCS}/col-own`), collabDelete()));
  });

  // ---- DENY: hard delete for every principal ------------------------------
  it('denies a hard delete for client, collaborator, and firm principals', async () => {
    await assertFails(deleteDoc(doc(dbAsPortal(PROJ), CLIENT_OWN)));
    await assertFails(deleteDoc(doc(dbAsCollab(), COLLAB_OWN)));
    await assertFails(deleteDoc(doc(dbAs('owner'), FIRM_FILE)));
  });
});
