/**
 * #13 task rules: phase CRUD for owner/admin/pm; task CRUD for owner/admin/pm
 * with department need-to-know enforced on create/update/delete (you can
 * never create, update into, or delete a task you couldn't see); append-only
 * task updates for any member who can see the parent task, with author
 * fields pinned to the caller and source pinned to 'web'.
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
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const TASKS_PATH = `workspaces/${WKS_A}/projects/proj1/tasks`;
const TASK_PATH = `${TASKS_PATH}/task1`;
const RESTRICTED_TASK_PATH = `${TASKS_PATH}/task-fin`;
const PHASE_PATH = `workspaces/${WKS_A}/projects/proj1/phases/phase1`;

const DEP_FINANCE = 'dep-finance';
const DEP_SITE = 'dep-site';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-tasks');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
});

beforeEach(async () => {
  await seedDoc(testEnv, TASK_PATH, validTask('task1'));
  await seedDoc(
    testEnv,
    RESTRICTED_TASK_PATH,
    validTask('task-fin', { restrictedToDepartments: [DEP_FINANCE] }),
  );
  await seedDoc(testEnv, PHASE_PATH, validPhase('phase1'));
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A, departments: string[] = []) {
  return testEnv
    .authenticatedContext(`user-${role}`, { ...memberClaims(wid, role, departments) })
    .firestore();
}

/** A phase doc that passes the #13 phase rules. */
function validPhase(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: 'Site prep',
    order: 1,
    status: 'todo',
    ...extra,
  };
}

/** A task doc that passes the #13 create rule for `user-<role>` callers. */
function validTask(
  id: string,
  extra: Record<string, unknown> = {},
  creator = 'user-owner',
): Record<string, unknown> {
  return {
    id,
    title: 'Pour foundation',
    status: 'todo',
    assignees: [],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    dependsOn: [],
    order: 1,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: creator,
    ...extra,
  };
}

/** An updates/{updid} payload that passes the #13 append rule. */
function validComment(
  id: string,
  author: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    authorType: 'user',
    authorId: author,
    authorNameDenorm: 'Test Member',
    source: 'web',
    action: 'comment',
    payload: { text: 'Looks good — see notes.' },
    createdAt: Timestamp.now(),
    ...extra,
  };
}

describe('phase writes', () => {
  it('allows owner, admin and pm to create, update and delete phases', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      const path = `workspaces/${WKS_A}/projects/proj1/phases/phase-${role}`;
      await assertSucceeds(setDoc(doc(dbAs(role), path), validPhase(`phase-${role}`)));
      await assertSucceeds(
        updateDoc(doc(dbAs(role), path), { name: 'Renamed', status: 'in_progress' }),
      );
      await assertSucceeds(deleteDoc(doc(dbAs(role), path)));
    }
  });

  it('denies viewer phase writes', async () => {
    await assertFails(
      setDoc(doc(dbAs('viewer'), `workspaces/${WKS_A}/projects/proj1/phases/px`), validPhase('px')),
    );
    await assertFails(updateDoc(doc(dbAs('viewer'), PHASE_PATH), { name: 'Nope' }));
    await assertFails(deleteDoc(doc(dbAs('viewer'), PHASE_PATH)));
  });

  it('denies invalid phase payloads', async () => {
    const path = `workspaces/${WKS_A}/projects/proj1/phases/px`;
    await assertFails(setDoc(doc(dbAs('owner'), path), validPhase('px', { status: 'blocked' })));
    await assertFails(setDoc(doc(dbAs('owner'), path), validPhase('px', { name: '' })));
    await assertFails(setDoc(doc(dbAs('owner'), path), validPhase('px', { name: 'x'.repeat(81) })));
    await assertFails(setDoc(doc(dbAs('owner'), path), validPhase('px', { color: 'red' })));
    await assertFails(setDoc(doc(dbAs('owner'), path), validPhase('other-id')));
  });

  it('denies cross-workspace phase writes', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner', WKS_B), `workspaces/${WKS_A}/projects/proj1/phases/px`),
        validPhase('px'),
      ),
    );
  });
});

describe('task create', () => {
  it('allows owner, admin and pm to create a valid task', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `${TASKS_PATH}/task-${role}`),
          validTask(`task-${role}`, {}, `user-${role}`),
        ),
      );
    }
  });

  it('denies viewer creating tasks', async () => {
    await assertFails(
      setDoc(doc(dbAs('viewer'), `${TASKS_PATH}/task-v`), validTask('task-v', {}, 'user-viewer')),
    );
  });

  it('allows a pm in the department to create a restricted task', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_FINANCE]), `${TASKS_PATH}/task-r`),
        validTask('task-r', { restrictedToDepartments: [DEP_FINANCE] }, 'user-pm'),
      ),
    );
  });

  it('denies a pm creating a task restricted to a department they are not in', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_SITE]), `${TASKS_PATH}/task-r`),
        validTask('task-r', { restrictedToDepartments: [DEP_FINANCE] }, 'user-pm'),
      ),
    );
  });

  it('denies createdBy spoofing', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('admin'), `${TASKS_PATH}/task-x`),
        validTask('task-x', { createdBy: 'someone-else' }),
      ),
    );
  });

  it('denies invalid task payloads', async () => {
    const path = `${TASKS_PATH}/task-x`;
    const invalid: Array<Record<string, unknown>> = [
      { title: '' },
      { title: 'x'.repeat(201) },
      { status: 'nope' },
      { description: 'x'.repeat(5001) },
      { dependsOn: ['task-x'] }, // self-dependency
      { requiresPhoto: true }, // removed by D-032 — extra key
      { visibleToClient: 'yes' },
      { restrictedToDepartments: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] },
    ];
    for (const extra of invalid) {
      await assertFails(setDoc(doc(dbAs('owner'), path), validTask('task-x', extra)));
    }
    await assertFails(setDoc(doc(dbAs('owner'), path), validTask('other-id')));
  });
});

describe('task update', () => {
  it('allows owner, admin and pm to edit a task', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        updateDoc(doc(dbAs(role), TASK_PATH), {
          title: `Edited by ${role}`,
          status: 'in_progress',
          updatedAt: Timestamp.now(),
        }),
      );
    }
  });

  it('denies viewer updates', async () => {
    await assertFails(
      updateDoc(doc(dbAs('viewer'), TASK_PATH), { title: 'Nope', updatedAt: Timestamp.now() }),
    );
  });

  it('denies tampering with id, createdAt, and createdBy', async () => {
    const tampering: Array<Record<string, unknown>> = [
      { id: 'renamed' },
      { createdAt: Timestamp.now() },
      { createdBy: 'user-admin' },
    ];
    for (const patch of tampering) {
      await assertFails(
        updateDoc(doc(dbAs('owner'), TASK_PATH), { ...patch, updatedAt: Timestamp.now() }),
      );
    }
  });

  it('denies a pm outside the department updating a restricted task', async () => {
    await assertFails(
      updateDoc(doc(dbAs('pm', WKS_A, [DEP_SITE]), RESTRICTED_TASK_PATH), {
        title: 'Nope',
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('allows a pm in the department to update a restricted task', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('pm', WKS_A, [DEP_FINANCE]), RESTRICTED_TASK_PATH), {
        title: 'Budget revision',
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('denies a pm restricting a task to a department they are not in', async () => {
    await assertFails(
      updateDoc(doc(dbAs('pm', WKS_A, [DEP_SITE]), TASK_PATH), {
        restrictedToDepartments: [DEP_FINANCE],
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('allows owner/admin to update any restricted task', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('admin'), RESTRICTED_TASK_PATH), {
        title: 'Admin edit',
        updatedAt: Timestamp.now(),
      }),
    );
  });
});

describe('task delete', () => {
  it('allows owner, admin and pm to delete an unrestricted task', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await seedDoc(testEnv, `${TASKS_PATH}/task-d`, validTask('task-d'));
      await assertSucceeds(deleteDoc(doc(dbAs(role), `${TASKS_PATH}/task-d`)));
    }
  });

  it('denies viewer deletes', async () => {
    await assertFails(deleteDoc(doc(dbAs('viewer'), TASK_PATH)));
  });

  it('denies a pm outside the department deleting a restricted task', async () => {
    await assertFails(deleteDoc(doc(dbAs('pm', WKS_A, [DEP_SITE]), RESTRICTED_TASK_PATH)));
  });
});

describe('task updates (activity stream)', () => {
  const UPDATES_PATH = `${TASK_PATH}/updates`;

  it('allows any member (even viewer) to comment on a visible task', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `${UPDATES_PATH}/upd-${role}`),
          validComment(`upd-${role}`, `user-${role}`),
        ),
      );
    }
  });

  it('allows non-comment actions with structured payloads', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm'), `${UPDATES_PATH}/upd-status`),
        validComment('upd-status', 'user-pm', {
          action: 'status_change',
          payload: { from: 'todo', to: 'in_progress' },
        }),
      ),
    );
  });

  it('allows doc_added and doc_deleted attachment actions (#14)', async () => {
    for (const action of ['doc_added', 'doc_deleted'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs('pm'), `${UPDATES_PATH}/upd-${action}`),
          validComment(`upd-${action}`, 'user-pm', {
            action,
            payload: {
              text: 'site-plan.pdf',
              storagePath: 'workspaces/wksA/projects/proj1/uuid-site-plan.pdf',
              mimeType: 'application/pdf',
            },
          }),
        ),
      );
    }
  });

  it('denies author spoofing and non-web sources', async () => {
    const spoofs: Array<Record<string, unknown>> = [
      { authorId: 'someone-else' },
      { authorType: 'system' },
      { authorType: 'collaborator' },
      { source: 'whatsapp' },
      { action: 'created' },
    ];
    for (const extra of spoofs) {
      await assertFails(
        setDoc(doc(dbAs('pm'), `${UPDATES_PATH}/upd-x`), validComment('upd-x', 'user-pm', extra)),
      );
    }
  });

  it('denies empty or over-long comment text', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('pm'), `${UPDATES_PATH}/upd-x`),
        validComment('upd-x', 'user-pm', { payload: { text: '' } }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('pm'), `${UPDATES_PATH}/upd-x`),
        validComment('upd-x', 'user-pm', { payload: { text: 'x'.repeat(5001) } }),
      ),
    );
  });

  it('denies commenting on a restricted task the member cannot see', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_SITE]), `${RESTRICTED_TASK_PATH}/updates/upd-x`),
        validComment('upd-x', 'user-pm'),
      ),
    );
  });

  it('allows commenting on a restricted task the member can see', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm', WKS_A, [DEP_FINANCE]), `${RESTRICTED_TASK_PATH}/updates/upd-r`),
        validComment('upd-r', 'user-pm'),
      ),
    );
  });

  it('denies editing or deleting an existing update (append-only)', async () => {
    await seedDoc(testEnv, `${UPDATES_PATH}/upd-frozen`, validComment('upd-frozen', 'user-owner'));
    await assertFails(
      updateDoc(doc(dbAs('owner'), `${UPDATES_PATH}/upd-frozen`), {
        payload: { text: 'Rewritten history' },
      }),
    );
    await assertFails(deleteDoc(doc(dbAs('owner'), `${UPDATES_PATH}/upd-frozen`)));
  });
});

describe('task list queries', () => {
  it('allows owner and admin to list tasks unconstrained', async () => {
    for (const role of ['owner', 'admin'] as const) {
      await assertSucceeds(getDocs(collection(dbAs(role), TASKS_PATH)));
    }
  });

  it('denies pm/viewer unconstrained list queries', async () => {
    for (const role of ['pm', 'viewer'] as const) {
      await assertFails(getDocs(collection(dbAs(role), TASKS_PATH)));
    }
  });

  it('allows pm listing with the unrestricted-equality constraint', async () => {
    await assertSucceeds(
      getDocs(
        query(collection(dbAs('pm'), TASKS_PATH), where('restrictedToDepartments', '==', [])),
      ),
    );
  });

  it('allows pm listing with an array-contains constraint on their department', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(dbAs('pm', WKS_A, [DEP_FINANCE]), TASKS_PATH),
          where('restrictedToDepartments', 'array-contains', DEP_FINANCE),
        ),
      ),
    );
  });

  it('denies pm querying a department not in their claims', async () => {
    await assertFails(
      getDocs(
        query(
          collection(dbAs('pm', WKS_A, [DEP_SITE]), TASKS_PATH),
          where('restrictedToDepartments', 'array-contains', DEP_FINANCE),
        ),
      ),
    );
  });

  it('denies restricted-task reads for members outside the department', async () => {
    await assertFails(getDoc(doc(dbAs('viewer'), RESTRICTED_TASK_PATH)));
    await assertSucceeds(getDoc(doc(dbAs('viewer', WKS_A, [DEP_FINANCE]), RESTRICTED_TASK_PATH)));
  });
});
