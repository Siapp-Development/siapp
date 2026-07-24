/**
 * #18 notification config rules: the task `notify` map is rules-validated
 * (exactly five bool keys when present); the `messages` queue stays
 * server-only even with the new queue fields; the workspace `notifications`
 * map is not client-writable (quiet hours flow through the
 * updateNotificationSettings callable).
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import { Timestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const TASK_PATH = `workspaces/${WKS_A}/projects/proj1/tasks/task1`;
const NEW_TASK_PATH = `workspaces/${WKS_A}/projects/proj1/tasks/task-new`;
const MESSAGE_PATH = `workspaces/${WKS_A}/messages/msg1`;
const NEW_MESSAGE_PATH = `workspaces/${WKS_A}/messages/msg-new`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-notifications');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
});

beforeEach(async () => {
  await seedDoc(testEnv, TASK_PATH, validTask('task1'));
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) }).firestore();
}

const VALID_NOTIFY = {
  statusChange: true,
  dueSoon: false,
  blocked: true,
  toClient: true,
  toInternal: false,
};

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

/** A queue record shaped like the #18 enqueue pipeline writes. */
function queuedMessage(id: string): Record<string, unknown> {
  return {
    id,
    channel: 'whatsapp',
    recipientPhone: '+60123456789',
    recipientType: 'client',
    recipientId: 'client1',
    templateName: 'task_status_change_v1',
    variables: { taskTitle: 'T', projectTitle: 'P' },
    status: 'queued',
    trigger: 'task_status_change',
    holdUntil: Timestamp.now(),
    dedupeKey: 'dueSoon_p1_t1_2026-07-23_client_client1',
    costEstimateMyr: 0.1,
    relatedTo: { type: 'task', id: 'task1' },
    createdAt: Timestamp.now(),
  };
}

describe('task notify map (#18, D2)', () => {
  it('allows create with a valid five-key bool map', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs('owner'), NEW_TASK_PATH),
        validTask('task-new', { notify: VALID_NOTIFY }),
      ),
    );
  });

  it('allows update setting a valid notify map (pm too)', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('pm'), TASK_PATH), {
        notify: VALID_NOTIFY,
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('still allows tasks without a notify map (regression)', async () => {
    // Distinct doc id: NEW_TASK_PATH is already created by the first test,
    // and a second setDoc there would evaluate as an update.
    const path = `workspaces/${WKS_A}/projects/proj1/tasks/task-plain`;
    await assertSucceeds(setDoc(doc(dbAs('owner'), path), validTask('task-plain')));
  });

  it('denies a notify map with an extra key', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), NEW_TASK_PATH),
        validTask('task-new', { notify: { ...VALID_NOTIFY, email: true } }),
      ),
    );
  });

  it('denies a notify map with a missing key', async () => {
    const { toInternal: _toInternal, ...missingKey } = VALID_NOTIFY;
    await assertFails(
      setDoc(doc(dbAs('owner'), NEW_TASK_PATH), validTask('task-new', { notify: missingKey })),
    );
  });

  it('denies non-bool values', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), NEW_TASK_PATH),
        validTask('task-new', { notify: { ...VALID_NOTIFY, statusChange: 'yes' } }),
      ),
    );
    await assertFails(
      setDoc(doc(dbAs('owner'), NEW_TASK_PATH), validTask('task-new', { notify: 'all' })),
    );
  });

  it('denies a viewer writing a notify map (role gate unchanged)', async () => {
    await assertFails(
      updateDoc(doc(dbAs('viewer'), TASK_PATH), { notify: VALID_NOTIFY }),
    );
  });
});

describe('messages queue stays server-only (#18, D3)', () => {
  it('denies create with the new queue fields for every firm role', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertFails(setDoc(doc(dbAs(role), NEW_MESSAGE_PATH), queuedMessage('msg-new')));
    }
  });

  it('denies updating queue fields (e.g. clearing suppressed / holdUntil)', async () => {
    await seedDoc(testEnv, MESSAGE_PATH, queuedMessage('msg1'));
    await assertFails(updateDoc(doc(dbAs('owner'), MESSAGE_PATH), { suppressed: false }));
    await assertFails(updateDoc(doc(dbAs('admin'), MESSAGE_PATH), { holdUntil: null }));
  });

  it('still allows member reads, denies cross-workspace reads', async () => {
    await seedDoc(testEnv, MESSAGE_PATH, queuedMessage('msg1'));
    await assertSucceeds(getDoc(doc(dbAs('viewer'), MESSAGE_PATH)));
    await assertFails(getDoc(doc(dbAs('owner', WKS_B), MESSAGE_PATH)));
  });
});

describe('workspace notifications map is not client-writable (#18, D1)', () => {
  it('denies owner writing notifications directly', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), `workspaces/${WKS_A}`), {
        notifications: {
          quietHours: {
            enabled: true,
            start: '21:00',
            end: '08:00',
            timezone: 'Asia/Kuala_Lumpur',
          },
        },
      }),
    );
  });

  it('denies setting the whole workspace doc with a notifications map', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('admin'), `workspaces/${WKS_A}`),
        { notifications: { quietHours: { enabled: false } } },
        { merge: true },
      ),
    );
  });
});
