/**
 * #21 portal Firestore rules: portal principals (custom-token claims
 * `portal.{wid,pid,cid,linkId}` minted by redeemPortalLink) get scoped reads
 * of ONE project — project doc, phases, milestones, client-visible documents
 * and client-safe activity — plus a pinned client-upload document create.
 * Everything re-gates on lifecycle published/completed (D-027), which is
 * what makes soft link-revocation (Q1) safe. Also covers the new firm-side
 * milestone CRUD (Q2). Headline criteria: no cross-project, cross-workspace,
 * or draft/archived access; no portal writes outside the upload path.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const CLIENT_ID = 'client1';
const PROJ_PUB = 'proj-portal-pub';
const PROJ_DRAFT = 'proj-portal-draft';
const PROJ_ARCH = 'proj-portal-arch';
const PROJ_OTHER = 'proj-portal-other';

const PUB_PREFIX = `workspaces/${WKS_A}/projects/${PROJ_PUB}`;
const DRAFT_PREFIX = `workspaces/${WKS_A}/projects/${PROJ_DRAFT}`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-portal');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
  await seedDoc(testEnv, PUB_PREFIX, { lifecycle: 'published', clientId: CLIENT_ID });
  await seedDoc(testEnv, DRAFT_PREFIX, { lifecycle: 'draft', clientId: CLIENT_ID });
  await seedDoc(testEnv, `workspaces/${WKS_A}/projects/${PROJ_ARCH}`, {
    lifecycle: 'archived',
    clientId: CLIENT_ID,
  });
  await seedDoc(testEnv, `workspaces/${WKS_A}/projects/${PROJ_OTHER}`, {
    lifecycle: 'published',
    clientId: 'client-other',
  });
  await seedDoc(testEnv, `workspaces/${WKS_B}/projects/${PROJ_PUB}`, {
    lifecycle: 'published',
    clientId: CLIENT_ID,
  });

  // Published-project subcollections.
  await seedDoc(testEnv, `${PUB_PREFIX}/phases/ph1`, { id: 'ph1', name: 'Foundation' });
  await seedDoc(testEnv, `${PUB_PREFIX}/milestones/mile-1`, {
    id: 'mile-1',
    name: 'Piling done',
    targetDate: Timestamp.now(),
    order: 1,
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/doc-vis`, {
    visibleToClient: true,
    deletedAt: null,
    restrictedToDepartments: [],
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/doc-hidden`, {
    visibleToClient: false,
    deletedAt: null,
    restrictedToDepartments: [],
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/doc-del`, {
    visibleToClient: true,
    deletedAt: Timestamp.now(),
    restrictedToDepartments: [],
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/activity/act-vis`, {
    visibleToClient: true,
    restrictedToDepartments: [],
    at: Timestamp.now(),
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/activity/act-int`, {
    visibleToClient: false,
    restrictedToDepartments: [],
    at: Timestamp.now(),
  });

  // Draft-project subcollections (lifecycle-gate denials).
  await seedDoc(testEnv, `${DRAFT_PREFIX}/phases/ph1`, { id: 'ph1', name: 'Foundation' });
  await seedDoc(testEnv, `${DRAFT_PREFIX}/documents/doc-vis`, {
    visibleToClient: true,
    deletedAt: null,
    restrictedToDepartments: [],
  });
  await seedDoc(testEnv, `${DRAFT_PREFIX}/activity/act-vis`, {
    visibleToClient: true,
    restrictedToDepartments: [],
    at: Timestamp.now(),
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

/** Firestore as a portal principal — same claims shape redeemPortalLink mints. */
function dbAsPortal(pid: string = PROJ_PUB, wid: string = WKS_A, cid: string = CLIENT_ID) {
  return testEnv
    .authenticatedContext(`portal_${wid}_${pid}_${cid}`, {
      portal: { wid, pid, cid, linkId: 'link1' },
    })
    .firestore();
}

function dbAs(role: TMemberRole, wid: string = WKS_A, departments: string[] = []) {
  return testEnv
    .authenticatedContext(`user-${role}`, { ...memberClaims(wid, role, departments) })
    .firestore();
}

/** A payload satisfying validPortalDocumentCreate. */
function validClientDocPayload(
  did: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: did,
    name: 'site-photo.png',
    mimeType: 'image/png',
    sizeBytes: 123456,
    storagePath: `workspaces/${WKS_A}/projects/${PROJ_PUB}/client-uploads/uuid-${did}.png`,
    scope: 'project',
    scopeId: PROJ_PUB,
    uploadedBy: CLIENT_ID,
    uploaderType: 'client',
    uploadedAt: Timestamp.now(),
    visibleToClient: true,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    scanStatus: 'pending',
    deletedAt: null,
    ...extra,
  };
}

describe('portal project reads', () => {
  it('allows the portal principal to get its published project', async () => {
    await assertSucceeds(getDoc(doc(dbAsPortal(), PUB_PREFIX)));
  });

  it('denies getting another project in the same workspace (claims pin pid)', async () => {
    await assertFails(
      getDoc(doc(dbAsPortal(), `workspaces/${WKS_A}/projects/${PROJ_OTHER}`)),
    );
  });

  it('denies cross-workspace access even for a same-named project', async () => {
    await assertFails(getDoc(doc(dbAsPortal(), `workspaces/${WKS_B}/projects/${PROJ_PUB}`)));
  });

  it('denies draft and archived projects (D-027 lifecycle gate)', async () => {
    await assertFails(getDoc(doc(dbAsPortal(PROJ_DRAFT), DRAFT_PREFIX)));
    await assertFails(
      getDoc(doc(dbAsPortal(PROJ_ARCH), `workspaces/${WKS_A}/projects/${PROJ_ARCH}`)),
    );
  });

  it('denies listing the projects collection (no enumeration)', async () => {
    await assertFails(getDocs(collection(dbAsPortal(), `workspaces/${WKS_A}/projects`)));
  });

  it('denies portal reads of the workspace doc, clients and magicLinks', async () => {
    await assertFails(getDoc(doc(dbAsPortal(), `workspaces/${WKS_A}`)));
    await assertFails(getDoc(doc(dbAsPortal(), `workspaces/${WKS_A}/clients/${CLIENT_ID}`)));
    await assertFails(getDoc(doc(dbAsPortal(), `workspaces/${WKS_A}/magicLinks/link1`)));
  });

  it('denies portal writes to its own project', async () => {
    await assertFails(updateDoc(doc(dbAsPortal(), PUB_PREFIX), { name: 'hacked' }));
  });
});

describe('portal phases and milestones reads', () => {
  it('allows phases and milestones reads on the live project', async () => {
    await assertSucceeds(getDoc(doc(dbAsPortal(), `${PUB_PREFIX}/phases/ph1`)));
    await assertSucceeds(getDocs(collection(dbAsPortal(), `${PUB_PREFIX}/phases`)));
    await assertSucceeds(getDoc(doc(dbAsPortal(), `${PUB_PREFIX}/milestones/mile-1`)));
    await assertSucceeds(getDocs(collection(dbAsPortal(), `${PUB_PREFIX}/milestones`)));
  });

  it('denies phase reads once the project is no longer live', async () => {
    await assertFails(getDoc(doc(dbAsPortal(PROJ_DRAFT), `${DRAFT_PREFIX}/phases/ph1`)));
  });

  it('denies portal milestone writes', async () => {
    await assertFails(
      setDoc(doc(dbAsPortal(), `${PUB_PREFIX}/milestones/mile-portal`), {
        id: 'mile-portal',
        name: 'Nope',
        targetDate: Timestamp.now(),
        order: 9,
      }),
    );
  });
});

describe('firm milestone CRUD (Q2)', () => {
  function validMilestone(id: string, extra: Record<string, unknown> = {}) {
    return {
      id,
      name: 'Roof trusses up',
      targetDate: Timestamp.now(),
      order: 2,
      ...extra,
    };
  }

  it('allows owner/admin/pm to create a valid milestone', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `${PUB_PREFIX}/milestones/mile-${role}`),
          validMilestone(`mile-${role}`),
        ),
      );
    }
  });

  it('accepts optional completedAt and description', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm'), `${PUB_PREFIX}/milestones/mile-done`),
        validMilestone('mile-done', {
          completedAt: Timestamp.now(),
          description: 'Signed off on site.',
        }),
      ),
    );
  });

  it('denies viewer milestone writes', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('viewer'), `${PUB_PREFIX}/milestones/mile-viewer`),
        validMilestone('mile-viewer'),
      ),
    );
  });

  it('rejects invalid shapes (id mismatch, missing targetDate, stray key)', async () => {
    const db = dbAs('pm');
    await assertFails(
      setDoc(doc(db, `${PUB_PREFIX}/milestones/mile-bad1`), validMilestone('other-id')),
    );
    await assertFails(
      setDoc(doc(db, `${PUB_PREFIX}/milestones/mile-bad2`), {
        id: 'mile-bad2',
        name: 'No date',
        order: 1,
      }),
    );
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/milestones/mile-bad3`),
        validMilestone('mile-bad3', { sneaky: true }),
      ),
    );
  });

  it('allows owner/admin/pm to update and delete a milestone', async () => {
    await seedDoc(testEnv, `${PUB_PREFIX}/milestones/mile-edit`, validMilestone('mile-edit'));
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm'), `${PUB_PREFIX}/milestones/mile-edit`),
        validMilestone('mile-edit', { name: 'Renamed milestone' }),
      ),
    );
    await assertSucceeds(deleteDoc(doc(dbAs('admin'), `${PUB_PREFIX}/milestones/mile-edit`)));
  });
});

describe('portal document reads', () => {
  it('allows getting a client-visible, non-deleted document on the live project', async () => {
    await assertSucceeds(getDoc(doc(dbAsPortal(), `${PUB_PREFIX}/documents/doc-vis`)));
  });

  it('denies hidden and soft-deleted documents', async () => {
    await assertFails(getDoc(doc(dbAsPortal(), `${PUB_PREFIX}/documents/doc-hidden`)));
    await assertFails(getDoc(doc(dbAsPortal(), `${PUB_PREFIX}/documents/doc-del`)));
  });

  it('denies document reads once the project is no longer live', async () => {
    await assertFails(getDoc(doc(dbAsPortal(PROJ_DRAFT), `${DRAFT_PREFIX}/documents/doc-vis`)));
  });

  it('allows the constrained list query and denies unconstrained lists', async () => {
    const db = dbAsPortal();
    await assertSucceeds(
      getDocs(
        query(
          collection(db, `${PUB_PREFIX}/documents`),
          where('visibleToClient', '==', true),
          where('deletedAt', '==', null),
        ),
      ),
    );
    await assertFails(getDocs(collection(db, `${PUB_PREFIX}/documents`)));
    await assertFails(
      getDocs(
        query(collection(db, `${PUB_PREFIX}/documents`), where('visibleToClient', '==', true)),
      ),
    );
  });

  it('still lets firm members read client-visible docs (regression)', async () => {
    await assertSucceeds(getDoc(doc(dbAs('viewer'), `${PUB_PREFIX}/documents/doc-vis`)));
  });
});

describe('portal document uploads (D7)', () => {
  it('allows a valid pinned client upload create', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAsPortal(), `${PUB_PREFIX}/documents/doc-up-ok`),
        validClientDocPayload('doc-up-ok'),
      ),
    );
  });

  it('rejects identity-field tampering (uploadedBy / uploaderType / scope)', async () => {
    const db = dbAsPortal();
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/documents/doc-up-b1`),
        validClientDocPayload('doc-up-b1', { uploadedBy: 'someone-else' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/documents/doc-up-b2`),
        validClientDocPayload('doc-up-b2', { uploaderType: 'firm_member' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/documents/doc-up-b3`),
        validClientDocPayload('doc-up-b3', { scope: 'task', scopeId: 'task1' }),
      ),
    );
  });

  it('rejects visibility/restriction/scan overrides', async () => {
    const db = dbAsPortal();
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/documents/doc-up-b4`),
        validClientDocPayload('doc-up-b4', { visibleToClient: false }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/documents/doc-up-b5`),
        validClientDocPayload('doc-up-b5', { restrictedToDepartments: ['dep-finance'] }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/documents/doc-up-b6`),
        validClientDocPayload('doc-up-b6', { scanStatus: 'clean' }),
      ),
    );
  });

  it('rejects paths outside client-uploads/, oversize files and firm-only mimes', async () => {
    const db = dbAsPortal();
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/documents/doc-up-b7`),
        validClientDocPayload('doc-up-b7', {
          storagePath: `workspaces/${WKS_A}/projects/${PROJ_PUB}/uuid-escape.png`,
        }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/documents/doc-up-b8`),
        validClientDocPayload('doc-up-b8', { sizeBytes: 10 * 1024 * 1024 + 1 }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, `${PUB_PREFIX}/documents/doc-up-b9`),
        validClientDocPayload('doc-up-b9', {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ),
    );
  });

  it('rejects uploads to a non-live project and updates/deletes of own uploads', async () => {
    await assertFails(
      setDoc(
        doc(dbAsPortal(PROJ_DRAFT), `${DRAFT_PREFIX}/documents/doc-up-b10`),
        validClientDocPayload('doc-up-b10', {
          storagePath: `workspaces/${WKS_A}/projects/${PROJ_DRAFT}/client-uploads/uuid-b10.png`,
          scopeId: PROJ_DRAFT,
        }),
      ),
    );
    await seedDoc(
      testEnv,
      `${PUB_PREFIX}/documents/doc-up-seeded`,
      validClientDocPayload('doc-up-seeded'),
    );
    await assertFails(
      updateDoc(doc(dbAsPortal(), `${PUB_PREFIX}/documents/doc-up-seeded`), {
        name: 'renamed.png',
      }),
    );
    await assertFails(deleteDoc(doc(dbAsPortal(), `${PUB_PREFIX}/documents/doc-up-seeded`)));
  });
});

describe('portal activity reads (D4)', () => {
  it('allows client-safe entries and the constrained list query', async () => {
    const db = dbAsPortal();
    await assertSucceeds(getDoc(doc(db, `${PUB_PREFIX}/activity/act-vis`)));
    await assertSucceeds(
      getDocs(
        query(collection(db, `${PUB_PREFIX}/activity`), where('visibleToClient', '==', true)),
      ),
    );
  });

  it('denies internal entries and unconstrained lists', async () => {
    const db = dbAsPortal();
    await assertFails(getDoc(doc(db, `${PUB_PREFIX}/activity/act-int`)));
    await assertFails(getDocs(collection(db, `${PUB_PREFIX}/activity`)));
  });

  it('denies activity reads once the project is no longer live', async () => {
    await assertFails(getDoc(doc(dbAsPortal(PROJ_DRAFT), `${DRAFT_PREFIX}/activity/act-vis`)));
  });

  it('denies portal activity writes', async () => {
    await assertFails(
      setDoc(doc(dbAsPortal(), `${PUB_PREFIX}/activity/act-forged`), {
        visibleToClient: true,
        action: 'task_status_changed',
      }),
    );
  });
});

describe('portal tasks stay hidden', () => {
  it('denies portal task reads even on the live project', async () => {
    await seedDoc(testEnv, `${PUB_PREFIX}/tasks/task-portal`, {
      title: 'Internal task',
      restrictedToDepartments: [],
    });
    await assertFails(getDoc(doc(dbAsPortal(), `${PUB_PREFIX}/tasks/task-portal`)));
    await assertFails(getDocs(collection(dbAsPortal(), `${PUB_PREFIX}/tasks`)));
  });
});
