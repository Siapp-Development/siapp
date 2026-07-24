/**
 * #22 collaborator Firestore rules: collab principals (custom-token claims
 * `collab.{wid,pid,tid,colid,linkId}` minted by redeemCollabLink) get ONE
 * pinned task (gated on lifecycle + collaborator visibility), read-back of
 * ONLY their own task updates, task-scoped shared document reads, and a
 * pinned collab-upload document create (D-f). All task/note WRITES go
 * through the submitCollabUpdate callable — direct writes stay denied.
 * Also covers the firm-side blockedReason field (D-d).
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import {
  Timestamp,
  collection,
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
const COL_ID = 'col1';
const PROJ_PUB = 'proj-collab-pub';
const PROJ_DRAFT = 'proj-collab-draft';
const TASK_OPEN = 'ctask-open';
const TASK_LIMITED = 'ctask-limited';
const TASK_HIDDEN = 'ctask-hidden';
const TASK_CLIENTVIS = 'ctask-clientvis';

const PUB_PREFIX = `workspaces/${WKS_A}/projects/${PROJ_PUB}`;
const DRAFT_PREFIX = `workspaces/${WKS_A}/projects/${PROJ_DRAFT}`;
const TASK_PATH = `${PUB_PREFIX}/tasks/${TASK_OPEN}`;

let testEnv: RulesTestEnvironment;

/** A task doc shaped like the #13 create rule output. */
function collabTask(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: 'Install rebar',
    status: 'in_progress',
    assignees: [{ type: 'collaborator', id: COL_ID }],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    dependsOn: [],
    order: 1,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: 'user-owner',
    ...extra,
  };
}

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-collab');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
  await seedDoc(testEnv, PUB_PREFIX, { lifecycle: 'published' });
  await seedDoc(testEnv, DRAFT_PREFIX, { lifecycle: 'draft' });
  await seedDoc(testEnv, `workspaces/${WKS_B}/projects/${PROJ_PUB}`, { lifecycle: 'published' });

  // Tasks: open (empty visibility list = all assignees), limited (this
  // collaborator listed), hidden (another collaborator listed), client-vis
  // (visibleToClient true — upload inheritance), plus a draft-project task.
  await seedDoc(testEnv, TASK_PATH, collabTask(TASK_OPEN));
  await seedDoc(
    testEnv,
    `${PUB_PREFIX}/tasks/${TASK_LIMITED}`,
    collabTask(TASK_LIMITED, { visibleToCollaboratorIds: [COL_ID] }),
  );
  await seedDoc(
    testEnv,
    `${PUB_PREFIX}/tasks/${TASK_HIDDEN}`,
    collabTask(TASK_HIDDEN, { visibleToCollaboratorIds: ['col-other'] }),
  );
  await seedDoc(
    testEnv,
    `${PUB_PREFIX}/tasks/${TASK_CLIENTVIS}`,
    collabTask(TASK_CLIENTVIS, { visibleToClient: true }),
  );
  await seedDoc(testEnv, `${DRAFT_PREFIX}/tasks/${TASK_OPEN}`, collabTask(TASK_OPEN));
  await seedDoc(testEnv, `workspaces/${WKS_B}/projects/${PROJ_PUB}/tasks/${TASK_OPEN}`, collabTask(TASK_OPEN));

  // Updates on the pinned task: one authored by this collaborator, one by
  // a firm user.
  await seedDoc(testEnv, `${TASK_PATH}/updates/cupd-own`, {
    id: 'cupd-own',
    authorType: 'collaborator',
    authorId: COL_ID,
    authorNameDenorm: 'Ahmad Rebar',
    source: 'web',
    action: 'comment',
    payload: { text: 'Halfway done.' },
    createdAt: Timestamp.now(),
  });
  await seedDoc(testEnv, `${TASK_PATH}/updates/cupd-firm`, {
    id: 'cupd-firm',
    authorType: 'user',
    authorId: 'user-pm',
    authorNameDenorm: 'PM Person',
    source: 'web',
    action: 'comment',
    payload: { text: 'Internal note.' },
    createdAt: Timestamp.now(),
  });

  // Documents: shared with this collaborator on the pinned task; shared but
  // scoped to another task; not shared; shared but soft-deleted.
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-shared`, {
    scope: 'task',
    scopeId: TASK_OPEN,
    visibleToClient: false,
    visibleToCollaboratorIds: [COL_ID],
    restrictedToDepartments: [],
    deletedAt: null,
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-otherscope`, {
    scope: 'task',
    scopeId: TASK_HIDDEN,
    visibleToClient: false,
    visibleToCollaboratorIds: [COL_ID],
    restrictedToDepartments: [],
    deletedAt: null,
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-notshared`, {
    scope: 'task',
    scopeId: TASK_OPEN,
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    deletedAt: null,
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-del`, {
    scope: 'task',
    scopeId: TASK_OPEN,
    visibleToClient: false,
    visibleToCollaboratorIds: [COL_ID],
    restrictedToDepartments: [],
    deletedAt: Timestamp.now(),
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

/** Firestore as a collab principal — same claims shape redeemCollabLink mints. */
function dbAsCollab(
  tid: string = TASK_OPEN,
  pid: string = PROJ_PUB,
  wid: string = WKS_A,
  colid: string = COL_ID,
) {
  return testEnv
    .authenticatedContext(`collab_${wid}_${tid}_${colid}`, {
      collab: { wid, pid, tid, colid, linkId: 'link1' },
    })
    .firestore();
}

function dbAs(role: TMemberRole, wid: string = WKS_A, departments: string[] = []) {
  return testEnv
    .authenticatedContext(`user-${role}`, { ...memberClaims(wid, role, departments) })
    .firestore();
}

/** A payload satisfying validCollabDocumentCreate for TASK_OPEN. */
function validCollabDocPayload(
  did: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: did,
    name: 'rebar-progress.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123456,
    storagePath: `workspaces/${WKS_A}/projects/${PROJ_PUB}/collab-uploads/uuid-${did}.pdf`,
    scope: 'task',
    scopeId: TASK_OPEN,
    uploadedBy: COL_ID,
    uploaderType: 'collaborator',
    uploadedAt: Timestamp.now(),
    visibleToClient: false,
    visibleToCollaboratorIds: [COL_ID],
    restrictedToDepartments: [],
    scanStatus: 'pending',
    deletedAt: null,
    ...extra,
  };
}

describe('collab task reads', () => {
  it('gets the pinned task when the visibility list is empty or includes the colid', async () => {
    await assertSucceeds(getDoc(doc(dbAsCollab(), TASK_PATH)));
    await assertSucceeds(
      getDoc(doc(dbAsCollab(TASK_LIMITED), `${PUB_PREFIX}/tasks/${TASK_LIMITED}`)),
    );
  });

  it('denies a task whose visibility list excludes the colid', async () => {
    await assertFails(getDoc(doc(dbAsCollab(TASK_HIDDEN), `${PUB_PREFIX}/tasks/${TASK_HIDDEN}`)));
  });

  it('denies tasks other than the pinned tid', async () => {
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/tasks/${TASK_LIMITED}`)));
  });

  it('denies draft-project and cross-workspace tasks (lifecycle gate)', async () => {
    await assertFails(
      getDoc(doc(dbAsCollab(TASK_OPEN, PROJ_DRAFT), `${DRAFT_PREFIX}/tasks/${TASK_OPEN}`)),
    );
    await assertFails(
      getDoc(
        doc(
          dbAsCollab(TASK_OPEN, PROJ_PUB, WKS_A),
          `workspaces/${WKS_B}/projects/${PROJ_PUB}/tasks/${TASK_OPEN}`,
        ),
      ),
    );
  });

  it('denies task list queries (get-only surface)', async () => {
    await assertFails(getDocs(collection(dbAsCollab(), `${PUB_PREFIX}/tasks`)));
  });
});

describe('collab writes stay denied (callable-only, D-b)', () => {
  it('denies direct task updates', async () => {
    await assertFails(updateDoc(doc(dbAsCollab(), TASK_PATH), { status: 'done' }));
  });

  it('denies direct updates/ appends', async () => {
    await assertFails(
      setDoc(doc(dbAsCollab(), `${TASK_PATH}/updates/cupd-new`), {
        id: 'cupd-new',
        authorType: 'collaborator',
        authorId: COL_ID,
        authorNameDenorm: 'Ahmad Rebar',
        source: 'web',
        action: 'comment',
        payload: { text: 'Direct write attempt.' },
        createdAt: Timestamp.now(),
      }),
    );
  });

  it('denies project, phase, activity and magicLink reads', async () => {
    await assertFails(getDoc(doc(dbAsCollab(), PUB_PREFIX)));
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/phases/phase1`)));
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/activity/act1`)));
    await assertFails(getDoc(doc(dbAsCollab(), `workspaces/${WKS_A}/magicLinks/a8K2pQ`)));
  });
});

describe('collab update read-back (D-c: own entries only)', () => {
  it('gets its own entry but not a firm-authored one', async () => {
    await assertSucceeds(getDoc(doc(dbAsCollab(), `${TASK_PATH}/updates/cupd-own`)));
    await assertFails(getDoc(doc(dbAsCollab(), `${TASK_PATH}/updates/cupd-firm`)));
  });

  it('lists only when the query pins authorId to the colid', async () => {
    await assertSucceeds(
      getDocs(
        query(collection(dbAsCollab(), `${TASK_PATH}/updates`), where('authorId', '==', COL_ID)),
      ),
    );
    await assertFails(getDocs(collection(dbAsCollab(), `${TASK_PATH}/updates`)));
  });
});

describe('collab document reads', () => {
  it('gets a doc shared with the colid on the pinned task', async () => {
    await assertSucceeds(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-shared`)));
  });

  it('denies other-task, unshared and soft-deleted docs', async () => {
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-otherscope`)));
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-notshared`)));
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-del`)));
  });

  it('lists only when the query pins scopeId + membership + deletedAt', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(dbAsCollab(), `${PUB_PREFIX}/documents`),
          where('scopeId', '==', TASK_OPEN),
          where('visibleToCollaboratorIds', 'array-contains', COL_ID),
          where('deletedAt', '==', null),
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(
          collection(dbAsCollab(), `${PUB_PREFIX}/documents`),
          where('scopeId', '==', TASK_OPEN),
          where('deletedAt', '==', null),
        ),
      ),
    );
  });
});

describe('collab document create (D-f)', () => {
  it('accepts a fully pinned payload', async () => {
    await assertSucceeds(
      setDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-ok`), validCollabDocPayload('cnew-ok')),
    );
  });

  it('inherits visibleToClient from the parent task (D-029)', async () => {
    // Pinned task is NOT client-visible → claiming true must fail.
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-vis`),
        validCollabDocPayload('cnew-vis', { visibleToClient: true }),
      ),
    );
    // Client-visible task → true succeeds, false fails.
    const onClientVisTask = validCollabDocPayload('cnew-cv', {
      scopeId: TASK_CLIENTVIS,
      visibleToClient: true,
    });
    await assertSucceeds(
      setDoc(doc(dbAsCollab(TASK_CLIENTVIS), `${PUB_PREFIX}/documents/cnew-cv`), onClientVisTask),
    );
    await assertFails(
      setDoc(
        doc(dbAsCollab(TASK_CLIENTVIS), `${PUB_PREFIX}/documents/cnew-cv2`),
        validCollabDocPayload('cnew-cv2', { scopeId: TASK_CLIENTVIS, visibleToClient: false }),
      ),
    );
  });

  it('rejects unpinned identity, scope and visibility fields', async () => {
    const cases: Record<string, unknown>[] = [
      { uploadedBy: 'someone-else' },
      { uploaderType: 'firm_member' },
      { scope: 'project', scopeId: PROJ_PUB },
      { scopeId: TASK_LIMITED },
      { visibleToCollaboratorIds: [] },
      { visibleToCollaboratorIds: [COL_ID, 'col-other'] },
      { visibleToCollaboratorIds: ['col-other'] },
      { restrictedToDepartments: ['dep-finance'] },
      { scanStatus: 'clean' },
      { deletedAt: Timestamp.now() },
    ];
    for (const [index, extra] of cases.entries()) {
      await assertFails(
        setDoc(
          doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-bad-${index}`),
          validCollabDocPayload(`cnew-bad-${index}`, extra),
        ),
      );
    }
  });

  it('rejects bad storage paths, mime types and sizes', async () => {
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-path`),
        validCollabDocPayload('cnew-path', {
          storagePath: `workspaces/${WKS_A}/projects/${PROJ_PUB}/uuid-x.pdf`,
        }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-mime`),
        validCollabDocPayload('cnew-mime', { mimeType: 'application/zip' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-size`),
        validCollabDocPayload('cnew-size', { sizeBytes: 25 * 1024 * 1024 + 1 }),
      ),
    );
  });

  it('rejects creates on a draft project (lifecycle gate)', async () => {
    await assertFails(
      setDoc(
        doc(dbAsCollab(TASK_OPEN, PROJ_DRAFT), `${DRAFT_PREFIX}/documents/cnew-draft`),
        validCollabDocPayload('cnew-draft', {
          storagePath: `workspaces/${WKS_A}/projects/${PROJ_DRAFT}/collab-uploads/uuid-x.pdf`,
        }),
      ),
    );
  });
});

describe('firm-side blockedReason (D-d)', () => {
  it('allows a firm update carrying a bounded blockedReason', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('pm'), TASK_PATH), {
        status: 'blocked',
        blockedReason: 'Waiting on materials.',
        updatedAt: Timestamp.now(),
        updatedBy: 'user-pm',
      }),
    );
  });

  it('rejects an oversized blockedReason', async () => {
    await assertFails(
      updateDoc(doc(dbAs('pm'), TASK_PATH), {
        status: 'blocked',
        blockedReason: 'x'.repeat(1001),
        updatedAt: Timestamp.now(),
        updatedBy: 'user-pm',
      }),
    );
  });
});
