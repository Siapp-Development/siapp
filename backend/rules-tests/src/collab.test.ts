/**
 * #127 collaborator Firestore rules: the collaborator-scoped access link mints
 * custom-token claims `collab.{wid, colid, linkId}` (uid `collab_{wid}_{colid}`)
 * and exposes EVERY task assigned to the collaborator on a live project, gated
 * by the assignee-membership rule (`assigneeCollaboratorIds.hasAny([colid])` +
 * `collabCanSeeTask` + `projectLive`) rather than a single pinned task.
 *
 * Covers: assignee-membership task reads (assigned+visible+live allow; not
 * assigned / not visible / draft-or-archived project / cross-workspace deny),
 * the per-collaborator `assignedTasks` mirror (own read allow, other colid /
 * write deny), membership-gated updates + documents reads, the task-parameterized
 * collab-upload create validator, and that NO client — firm member or collab —
 * can read the server-only `magicLinks` token material.
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
const OTHER_COL = 'col-other';
const PROJ_PUB = 'proj-collab-pub';
const PROJ_DRAFT = 'proj-collab-draft';

// Tasks in the published project, keyed by the assignee/visibility case.
const TASK_ASSIGNED = 'ctask-assigned'; // assigned col1, visible to all
const TASK_LIMITED = 'ctask-limited'; // assigned col1, visible list = [col1]
const TASK_HIDDEN = 'ctask-hidden'; // assigned col1, visible list = [col-other]
const TASK_UNASSIGNED = 'ctask-unassigned'; // assigned col-other only
const TASK_CLIENTVIS = 'ctask-clientvis'; // assigned col1, visibleToClient

const PUB_PREFIX = `workspaces/${WKS_A}/projects/${PROJ_PUB}`;
const DRAFT_PREFIX = `workspaces/${WKS_A}/projects/${PROJ_DRAFT}`;
const ASSIGNED_PATH = `${PUB_PREFIX}/tasks/${TASK_ASSIGNED}`;

let testEnv: RulesTestEnvironment;

/**
 * A task doc shaped like the #13 create rule output, PLUS the #127
 * `assigneeCollaboratorIds` queryable projection the rules gate reads.
 */
function collabTask(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: 'Install rebar',
    status: 'in_progress',
    assignees: [{ type: 'collaborator', id: COL_ID }],
    assigneeCollaboratorIds: [COL_ID],
    visibleToClient: false,
    collaboratorCanSeeAllAttachments: true,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
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

  await seedDoc(testEnv, ASSIGNED_PATH, collabTask(TASK_ASSIGNED));
  await seedDoc(
    testEnv,
    `${PUB_PREFIX}/tasks/${TASK_LIMITED}`,
    collabTask(TASK_LIMITED, { visibleToCollaboratorIds: [COL_ID] }),
  );
  await seedDoc(
    testEnv,
    `${PUB_PREFIX}/tasks/${TASK_HIDDEN}`,
    collabTask(TASK_HIDDEN, { visibleToCollaboratorIds: [OTHER_COL] }),
  );
  await seedDoc(
    testEnv,
    `${PUB_PREFIX}/tasks/${TASK_UNASSIGNED}`,
    collabTask(TASK_UNASSIGNED, {
      assignees: [{ type: 'collaborator', id: OTHER_COL }],
      assigneeCollaboratorIds: [OTHER_COL],
    }),
  );
  await seedDoc(
    testEnv,
    `${PUB_PREFIX}/tasks/${TASK_CLIENTVIS}`,
    collabTask(TASK_CLIENTVIS, { visibleToClient: true }),
  );
  // Same task assigned to col1 but on a draft project + on another workspace.
  await seedDoc(testEnv, `${DRAFT_PREFIX}/tasks/${TASK_ASSIGNED}`, collabTask(TASK_ASSIGNED));
  await seedDoc(
    testEnv,
    `workspaces/${WKS_B}/projects/${PROJ_PUB}/tasks/${TASK_ASSIGNED}`,
    collabTask(TASK_ASSIGNED),
  );

  // Updates on the assigned task: one authored by col1, one by the firm, one by
  // another collaborator. Plus an update on a task col1 is NOT assigned to.
  await seedDoc(testEnv, `${ASSIGNED_PATH}/updates/cupd-own`, {
    id: 'cupd-own',
    authorType: 'collaborator',
    authorId: COL_ID,
    authorNameDenorm: 'Ahmad Rebar',
    source: 'web',
    action: 'comment',
    payload: { text: 'Halfway done.' },
    createdAt: Timestamp.now(),
  });
  await seedDoc(testEnv, `${ASSIGNED_PATH}/updates/cupd-firm`, {
    id: 'cupd-firm',
    authorType: 'user',
    authorId: 'user-pm',
    authorNameDenorm: 'PM Person',
    source: 'web',
    action: 'comment',
    payload: { text: 'Internal note.' },
    createdAt: Timestamp.now(),
  });
  await seedDoc(testEnv, `${ASSIGNED_PATH}/updates/cupd-othercol`, {
    id: 'cupd-othercol',
    authorType: 'collaborator',
    authorId: OTHER_COL,
    authorNameDenorm: 'Other Collaborator',
    source: 'web',
    action: 'comment',
    payload: { text: 'Not yours.' },
    createdAt: Timestamp.now(),
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/tasks/${TASK_UNASSIGNED}/updates/cupd-unassigned`, {
    id: 'cupd-unassigned',
    authorType: 'collaborator',
    authorId: COL_ID,
    authorNameDenorm: 'Ahmad Rebar',
    source: 'web',
    action: 'comment',
    payload: { text: 'On a task I am not assigned to.' },
    createdAt: Timestamp.now(),
  });

  // Documents scoped to tasks. cdoc-shared is on an assigned task; the
  // otherscope doc is on a task col1 is not assigned to; the deleted one is
  // soft-deleted.
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-shared`, {
    scope: 'task',
    scopeId: TASK_ASSIGNED,
    visibleToClient: false,
    visibleToCollaboratorIds: [COL_ID],
    restrictedToDepartments: [],
    deletedAt: null,
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-otherscope`, {
    scope: 'task',
    scopeId: TASK_UNASSIGNED,
    visibleToClient: false,
    visibleToCollaboratorIds: [COL_ID],
    restrictedToDepartments: [],
    deletedAt: null,
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-notshared`, {
    scope: 'task',
    scopeId: TASK_ASSIGNED,
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    deletedAt: null,
  });
  await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-del`, {
    scope: 'task',
    scopeId: TASK_ASSIGNED,
    visibleToClient: false,
    visibleToCollaboratorIds: [COL_ID],
    restrictedToDepartments: [],
    deletedAt: Timestamp.now(),
  });

  // Per-collaborator assignedTasks mirror docs (server-maintained).
  await seedDoc(testEnv, `workspaces/${WKS_A}/collaborators/${COL_ID}/assignedTasks/at-own`, {
    projectId: PROJ_PUB,
    taskId: TASK_ASSIGNED,
    title: 'Install rebar',
    status: 'in_progress',
    projectName: 'Tower A',
    lifecycle: 'published',
    visibleToThisCollaborator: true,
    updatedAt: Timestamp.now(),
  });
  await seedDoc(testEnv, `workspaces/${WKS_A}/collaborators/${OTHER_COL}/assignedTasks/at-other`, {
    projectId: PROJ_PUB,
    taskId: TASK_UNASSIGNED,
    title: 'Other work',
    status: 'todo',
    projectName: 'Tower A',
    lifecycle: 'published',
    visibleToThisCollaborator: true,
    updatedAt: Timestamp.now(),
  });

  // Server-only magic-link token material (must never be client-readable).
  await seedDoc(testEnv, `workspaces/${WKS_A}/magicLinks/a8K2pQ`, {
    id: 'a8K2pQ',
    shortCode: 'a8K2pQabcdef',
    secretHash: 'deadbeef',
    token: 'a8K2pQabcdef_supersecrettokenvalue1234567890',
    audience: 'collaborator',
    scopeType: 'collaborator',
    scopeId: COL_ID,
    subjectId: COL_ID,
    revoked: false,
    expiresAt: Timestamp.fromMillis(Date.now() + 1_000_000),
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

/** Firestore as a collab principal — the claims redeemCollabLink mints (#127). */
function dbAsCollab(colid: string = COL_ID, wid: string = WKS_A) {
  return testEnv
    .authenticatedContext(`collab_${wid}_${colid}`, {
      collab: { wid, colid, linkId: 'link1' },
    })
    .firestore();
}

function dbAs(role: TMemberRole, wid: string = WKS_A, departments: string[] = []) {
  return testEnv
    .authenticatedContext(`user-${role}`, { ...memberClaims(wid, role, departments) })
    .firestore();
}

/** A payload satisfying validCollabDocumentCreate for a given task. */
function validCollabDocPayload(
  did: string,
  scopeId: string = TASK_ASSIGNED,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: did,
    name: 'rebar-progress.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123456,
    storagePath: `workspaces/${WKS_A}/projects/${PROJ_PUB}/collab-uploads/uuid-${did}.pdf`,
    scope: 'task',
    scopeId,
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

describe('assignee-membership task reads (#127)', () => {
  it('reads any task it is assigned to while the project is live', async () => {
    await assertSucceeds(getDoc(doc(dbAsCollab(), ASSIGNED_PATH)));
    await assertSucceeds(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/tasks/${TASK_LIMITED}`)));
    await assertSucceeds(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/tasks/${TASK_CLIENTVIS}`)));
  });

  it('denies a task it is not an assignee of', async () => {
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/tasks/${TASK_UNASSIGNED}`)));
  });

  it('denies an assigned task whose visibility list excludes the colid', async () => {
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/tasks/${TASK_HIDDEN}`)));
  });

  it('denies assigned tasks on a draft (non-live) project', async () => {
    await assertFails(getDoc(doc(dbAsCollab(), `${DRAFT_PREFIX}/tasks/${TASK_ASSIGNED}`)));
  });

  it('denies cross-workspace reads even for the same task id (isolation)', async () => {
    // Claim wid = WKS_A → isCollabWorkspace(WKS_B) is false.
    await assertFails(
      getDoc(doc(dbAsCollab(), `workspaces/${WKS_B}/projects/${PROJ_PUB}/tasks/${TASK_ASSIGNED}`)),
    );
  });

  it('denies another collaborator reading a task assigned only to col1', async () => {
    await assertFails(getDoc(doc(dbAsCollab(OTHER_COL), ASSIGNED_PATH)));
  });

  it('denies task list queries (get-only surface)', async () => {
    await assertFails(getDocs(collection(dbAsCollab(), `${PUB_PREFIX}/tasks`)));
  });
});

describe('assignedTasks mirror (#127)', () => {
  it('reads ONLY its own assignedTasks subcollection', async () => {
    await assertSucceeds(
      getDoc(doc(dbAsCollab(), `workspaces/${WKS_A}/collaborators/${COL_ID}/assignedTasks/at-own`)),
    );
    await assertSucceeds(
      getDocs(collection(dbAsCollab(), `workspaces/${WKS_A}/collaborators/${COL_ID}/assignedTasks`)),
    );
  });

  it("denies reading another collaborator's assignedTasks", async () => {
    await assertFails(
      getDoc(
        doc(dbAsCollab(), `workspaces/${WKS_A}/collaborators/${OTHER_COL}/assignedTasks/at-other`),
      ),
    );
    await assertFails(
      getDocs(
        collection(dbAsCollab(), `workspaces/${WKS_A}/collaborators/${OTHER_COL}/assignedTasks`),
      ),
    );
  });

  it('denies collaborator writes to its own mirror (server-only fan-out)', async () => {
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `workspaces/${WKS_A}/collaborators/${COL_ID}/assignedTasks/at-new`),
        { projectId: PROJ_PUB, taskId: TASK_ASSIGNED, visibleToThisCollaborator: true },
      ),
    );
    await assertFails(
      updateDoc(
        doc(dbAsCollab(), `workspaces/${WKS_A}/collaborators/${COL_ID}/assignedTasks/at-own`),
        { status: 'done' },
      ),
    );
  });

  it('denies a firm member reading a collaborator mirror only via the collab rule', async () => {
    // Firm members still read the parent collaborators tree, but a collab
    // principal cannot enumerate the collaborators collection.
    await assertFails(getDocs(collection(dbAsCollab(), `workspaces/${WKS_A}/collaborators`)));
  });
});

describe('collab writes stay denied (callable-only, D-b)', () => {
  it('denies direct task updates', async () => {
    await assertFails(updateDoc(doc(dbAsCollab(), ASSIGNED_PATH), { status: 'done' }));
  });

  it('denies direct updates/ appends', async () => {
    await assertFails(
      setDoc(doc(dbAsCollab(), `${ASSIGNED_PATH}/updates/cupd-new`), {
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

  it('denies project, phase, activity reads', async () => {
    await assertFails(getDoc(doc(dbAsCollab(), PUB_PREFIX)));
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/phases/phase1`)));
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/activity/act1`)));
  });
});

describe('magicLinks token material is server-only (#127, D-035)', () => {
  it('denies the collab principal reading its own link doc/token', async () => {
    await assertFails(getDoc(doc(dbAsCollab(), `workspaces/${WKS_A}/magicLinks/a8K2pQ`)));
  });

  it('denies EVERY firm role reading the magicLink token field', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertFails(getDoc(doc(dbAs(role), `workspaces/${WKS_A}/magicLinks/a8K2pQ`)));
      await assertFails(getDocs(collection(dbAs(role), `workspaces/${WKS_A}/magicLinks`)));
    }
  });
});

describe('collab update read-back (D-c: own entries only)', () => {
  it('gets its own entry but not firm- or other-collaborator-authored ones', async () => {
    await assertSucceeds(getDoc(doc(dbAsCollab(), `${ASSIGNED_PATH}/updates/cupd-own`)));
    await assertFails(getDoc(doc(dbAsCollab(), `${ASSIGNED_PATH}/updates/cupd-firm`)));
    await assertFails(getDoc(doc(dbAsCollab(), `${ASSIGNED_PATH}/updates/cupd-othercol`)));
  });

  it('denies updates on a task the collaborator is not assigned to', async () => {
    await assertFails(
      getDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/tasks/${TASK_UNASSIGNED}/updates/cupd-unassigned`),
      ),
    );
  });

  it('lists only when the query pins authorType + authorId to the colid', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(dbAsCollab(), `${ASSIGNED_PATH}/updates`),
          where('authorType', '==', 'collaborator'),
          where('authorId', '==', COL_ID),
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(collection(dbAsCollab(), `${ASSIGNED_PATH}/updates`), where('authorId', '==', COL_ID)),
      ),
    );
    await assertFails(getDocs(collection(dbAsCollab(), `${ASSIGNED_PATH}/updates`)));
  });
});

describe('collab document reads via assignee-membership', () => {
  it('gets a doc on a task it is assigned to', async () => {
    await assertSucceeds(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-shared`)));
  });

  it('denies docs on tasks it is not assigned to, and soft-deleted docs', async () => {
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-otherscope`)));
    await assertFails(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-del`)));
  });

  it('allows unshared docs when collaboratorCanSeeAllAttachments is true (#92)', async () => {
    await assertSucceeds(getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-notshared`)));
  });

  it('allows scopeId+membership+deletedAt list shape', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(dbAsCollab(), `${PUB_PREFIX}/documents`),
          where('scopeId', '==', TASK_ASSIGNED),
          where('visibleToCollaboratorIds', 'array-contains', COL_ID),
          where('deletedAt', '==', null),
        ),
      ),
    );
  });

  it('allows scopeId+deletedAt list when the task flag is true', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(dbAsCollab(), `${PUB_PREFIX}/documents`),
          where('scopeId', '==', TASK_ASSIGNED),
          where('deletedAt', '==', null),
        ),
      ),
    );
  });

  it('requires visibleToCollaboratorIds pin when the task flag is false (#92)', async () => {
    const TASK_RESTRICTED = 'ctask-restricted-attachments';
    await seedDoc(
      testEnv,
      `${PUB_PREFIX}/tasks/${TASK_RESTRICTED}`,
      collabTask(TASK_RESTRICTED, { collaboratorCanSeeAllAttachments: false }),
    );
    await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-restricted-attachments`, {
      scope: 'task',
      scopeId: TASK_RESTRICTED,
      visibleToClient: false,
      visibleToCollaboratorIds: [COL_ID],
      restrictedToDepartments: [],
      deletedAt: null,
    });
    await seedDoc(testEnv, `${PUB_PREFIX}/documents/cdoc-restricted-unshared`, {
      scope: 'task',
      scopeId: TASK_RESTRICTED,
      visibleToClient: false,
      visibleToCollaboratorIds: [],
      restrictedToDepartments: [],
      deletedAt: null,
    });

    await assertFails(
      getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-restricted-unshared`)),
    );
    await assertSucceeds(
      getDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cdoc-restricted-attachments`)),
    );

    await assertFails(
      getDocs(
        query(
          collection(dbAsCollab(), `${PUB_PREFIX}/documents`),
          where('scopeId', '==', TASK_RESTRICTED),
          where('deletedAt', '==', null),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(dbAsCollab(), `${PUB_PREFIX}/documents`),
          where('scopeId', '==', TASK_RESTRICTED),
          where('visibleToCollaboratorIds', 'array-contains', COL_ID),
          where('deletedAt', '==', null),
        ),
      ),
    );
  });
});

describe('collab document create (D-f) — task-parameterized validator', () => {
  it('accepts a valid payload scoped to an assigned task', async () => {
    await assertSucceeds(
      setDoc(doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-ok`), validCollabDocPayload('cnew-ok')),
    );
  });

  it('rejects a create scoped to a task the collaborator is not assigned to', async () => {
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-unassigned`),
        validCollabDocPayload('cnew-unassigned', TASK_UNASSIGNED),
      ),
    );
  });

  it('inherits visibleToClient from the parent task at the submitted scopeId (D-029)', async () => {
    // Assigned task is NOT client-visible → claiming true must fail.
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-vis`),
        validCollabDocPayload('cnew-vis', TASK_ASSIGNED, { visibleToClient: true }),
      ),
    );
    // Client-visible task → true succeeds, false fails.
    await assertSucceeds(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-cv`),
        validCollabDocPayload('cnew-cv', TASK_CLIENTVIS, { visibleToClient: true }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-cv2`),
        validCollabDocPayload('cnew-cv2', TASK_CLIENTVIS, { visibleToClient: false }),
      ),
    );
  });

  it('rejects unpinned identity, scope and visibility fields', async () => {
    const cases: Record<string, unknown>[] = [
      { uploadedBy: 'someone-else' },
      { uploaderType: 'firm_member' },
      { visibleToCollaboratorIds: [] },
      { visibleToCollaboratorIds: [COL_ID, OTHER_COL] },
      { visibleToCollaboratorIds: [OTHER_COL] },
      { restrictedToDepartments: ['dep-finance'] },
      { scanStatus: 'clean' },
      { deletedAt: Timestamp.now() },
    ];
    for (const [index, extra] of cases.entries()) {
      await assertFails(
        setDoc(
          doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-bad-${index}`),
          validCollabDocPayload(`cnew-bad-${index}`, TASK_ASSIGNED, extra),
        ),
      );
    }
  });

  it('rejects bad storage paths and oversized files', async () => {
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-path`),
        validCollabDocPayload('cnew-path', TASK_ASSIGNED, {
          storagePath: `workspaces/${WKS_A}/projects/${PROJ_PUB}/uuid-x.pdf`,
        }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-mime`),
        validCollabDocPayload('cnew-mime', TASK_ASSIGNED, { mimeType: 'application/zip' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${PUB_PREFIX}/documents/cnew-size-too-large`),
        validCollabDocPayload('cnew-size-too-large', TASK_ASSIGNED, {
          sizeBytes: 30 * 1024 * 1024,
        }),
      ),
    );
  });

  it('rejects creates on a draft project (lifecycle gate)', async () => {
    await seedDoc(testEnv, `${DRAFT_PREFIX}/tasks/${TASK_ASSIGNED}`, collabTask(TASK_ASSIGNED));
    await assertFails(
      setDoc(
        doc(dbAsCollab(), `${DRAFT_PREFIX}/documents/cnew-draft`),
        validCollabDocPayload('cnew-draft', TASK_ASSIGNED, {
          storagePath: `workspaces/${WKS_A}/projects/${PROJ_DRAFT}/collab-uploads/uuid-x.pdf`,
        }),
      ),
    );
  });
});

describe('firm-side blockedReason (D-d)', () => {
  it('allows a firm update carrying a bounded blockedReason', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('pm'), ASSIGNED_PATH), {
        status: 'blocked',
        blockedReason: 'Waiting on materials.',
        updatedAt: Timestamp.now(),
        updatedBy: 'user-pm',
      }),
    );
  });

  it('rejects an oversized blockedReason', async () => {
    await assertFails(
      updateDoc(doc(dbAs('pm'), ASSIGNED_PATH), {
        status: 'blocked',
        blockedReason: 'x'.repeat(1001),
        updatedAt: Timestamp.now(),
        updatedBy: 'user-pm',
      }),
    );
  });
});
