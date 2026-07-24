import { describe, expect, it } from 'vitest';

import {
  planTaskNotifications,
  type IPlanTaskNotificationsInput,
} from './enqueueNotifications.js';
import { QUIET_HOURS_DEFAULT } from './quietHours.js';

// 12:00 UTC = 20:00 MYT — outside the default 21:00–08:00 window.
const OUTSIDE_QUIET = new Date('2026-07-23T12:00:00Z');
// 15:00 UTC = 23:00 MYT — inside; next window end is 08:00 MYT Jul 24 = 00:00Z.
const INSIDE_QUIET = new Date('2026-07-23T15:00:00Z');
const EXPECTED_HOLD = new Date('2026-07-24T00:00:00Z');

function input(overrides: Partial<IPlanTaskNotificationsInput> = {}): IPlanTaskNotificationsInput {
  return {
    trigger: 'task_status_change',
    projectId: 'p1',
    taskId: 't1',
    taskData: {
      title: 'Pour foundation',
      status: 'in_progress',
      sendWhatsapp: true,
      assignees: [],
    },
    projectData: {
      name: 'Bungalow Reno',
      lifecycle: 'published',
      clientId: 'client1',
    },
    clientData: { name: 'Ahmad', phone: '+60123456789' },
    memberProfiles: new Map(),
    quietHours: { ...QUIET_HOURS_DEFAULT },
    firmName: 'Acme Builders',
    now: OUTSIDE_QUIET,
    ...overrides,
  };
}

describe('planTaskNotifications — D8 decision table', () => {
  it('writes no record at all when sendWhatsapp is off', () => {
    expect(
      planTaskNotifications(input({ taskData: { status: 'todo', sendWhatsapp: false } })),
    ).toEqual([]);
  });

  it('writes no record when the specific trigger is off in notify', () => {
    const taskData = {
      title: 'T',
      status: 'in_progress',
      sendWhatsapp: true,
      assignees: [],
      notify: { statusChange: false, dueSoon: true, blocked: true, toClient: true, toInternal: false },
    };
    expect(planTaskNotifications(input({ taskData }))).toEqual([]);
    // blocked stays on for the same task.
    expect(planTaskNotifications(input({ taskData, trigger: 'task_blocked' }))).toHaveLength(1);
  });

  it('writes no record when the recipient side is off', () => {
    const taskData = {
      title: 'T',
      status: 'in_progress',
      sendWhatsapp: true,
      assignees: [],
      notify: { statusChange: true, dueSoon: true, blocked: true, toClient: false, toInternal: false },
    };
    expect(planTaskNotifications(input({ taskData }))).toEqual([]);
  });

  it('writes the D-027 preview record (suppressed lifecycle:<state>) on a draft project', () => {
    const planned = planTaskNotifications(
      input({ projectData: { name: 'P', lifecycle: 'draft', clientId: 'client1' } }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      suppressed: true,
      suppressedReason: 'lifecycle:draft',
      status: 'queued',
      trigger: 'task_status_change',
    });
    expect(planned[0].data).not.toHaveProperty('holdUntil');
  });

  it('suppresses with opt_out for an opted-out client', () => {
    const planned = planTaskNotifications(
      input({ clientData: { phone: '+60123456789', notificationsOptOut: true } }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({ suppressed: true, suppressedReason: 'opt_out' });
  });

  it('suppresses with no_recipient when no client is linked', () => {
    const planned = planTaskNotifications(
      input({
        projectData: { name: 'P', lifecycle: 'published', clientId: '' },
        clientData: undefined,
      }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      suppressed: true,
      suppressedReason: 'no_recipient',
      recipientType: 'client',
      recipientId: '',
    });
  });

  it('suppresses with no_phone for a member assignee without a profile phone (D7)', () => {
    const taskData = {
      title: 'T',
      status: 'in_progress',
      sendWhatsapp: true,
      assignees: [{ type: 'user', id: 'u1', name: 'Alice' }],
      notify: { statusChange: true, dueSoon: true, blocked: true, toClient: false, toInternal: true },
    };
    const planned = planTaskNotifications(
      input({ taskData, memberProfiles: new Map([['u1', { displayName: 'Alice' }]]) }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      suppressed: true,
      suppressedReason: 'no_phone',
      recipientType: 'member',
      recipientId: 'u1',
    });
  });

  it('queues with holdUntil = next 08:00 MYT inside quiet hours', () => {
    const planned = planTaskNotifications(input({ now: INSIDE_QUIET }));
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({ status: 'queued', holdUntil: EXPECTED_HOLD });
    expect(planned[0].data).not.toHaveProperty('suppressed');
  });

  it('queues without holdUntil outside quiet hours', () => {
    const planned = planTaskNotifications(input());
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      status: 'queued',
      channel: 'whatsapp',
      recipientType: 'client',
      recipientId: 'client1',
      recipientPhone: '+60123456789',
      trigger: 'task_status_change',
      templateName: 'task_status_change_v1',
      costEstimateMyr: 0.1,
      relatedTo: { type: 'task', id: 't1' },
    });
    expect(planned[0].data).not.toHaveProperty('holdUntil');
    expect(planned[0].data).toMatchObject({
      variables: {
        taskTitle: 'Pour foundation',
        projectTitle: 'Bungalow Reno',
        newStatus: 'in_progress',
        firmName: 'Acme Builders',
      },
    });
  });

  it('fans out one record per resolved recipient when toClient and toInternal are both on', () => {
    const taskData = {
      title: 'T',
      status: 'in_progress',
      sendWhatsapp: true,
      assignees: [
        { type: 'user', id: 'u1', name: 'Alice' },
        { type: 'user', id: 'u2', name: 'Sam' },
        { type: 'collaborator', id: 'col1', name: 'Lim', phone: '+60111111111' },
      ],
      notify: { statusChange: true, dueSoon: true, blocked: true, toClient: true, toInternal: true },
    };
    const planned = planTaskNotifications(
      input({
        taskData,
        memberProfiles: new Map([
          ['u1', { phone: '+60122222222' }],
          ['u2', { phone: '+60133333333' }],
        ]),
      }),
    );
    // Client + two members; collaborator assignees are out of scope for these
    // triggers at MVP (#18 risk note).
    expect(planned).toHaveLength(3);
    expect(planned.map((m) => (m.data as { recipientType: string }).recipientType)).toEqual([
      'client',
      'member',
      'member',
    ]);
  });

  it('uses deterministic dedupe ids for task_due_soon only (D5)', () => {
    const dueSoonTask = {
      title: 'T',
      status: 'todo',
      sendWhatsapp: true,
      assignees: [],
      dueDate: { toDate: () => new Date('2026-07-24T04:00:00Z') },
    };
    const planned = planTaskNotifications(input({ trigger: 'task_due_soon', taskData: dueSoonTask }));
    expect(planned).toHaveLength(1);
    expect(planned[0].id).toBe('dueSoon_p1_t1_2026-07-23_client_client1');
    expect(planned[0].data).toMatchObject({ dedupeKey: 'dueSoon_p1_t1_2026-07-23_client_client1' });
    // Same inputs → same id (re-run cannot double-enqueue).
    expect(planTaskNotifications(input({ trigger: 'task_due_soon', taskData: dueSoonTask }))[0].id).toBe(
      planned[0].id,
    );
    // Status-change events use auto ids.
    expect(planTaskNotifications(input())[0].id).toBeNull();
  });
});
