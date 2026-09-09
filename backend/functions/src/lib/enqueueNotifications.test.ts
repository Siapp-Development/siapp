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
      clientIds: ['client1'],
    },
    // waConsent granted so the #26 D2 gate lets the happy paths through.
    clients: [
      { id: 'client1', data: { name: 'Ahmad', phone: '+60123456789', waConsent: { granted: true } } },
    ],
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

  it('#142 Q4: status_change ignores toClient/toInternal config — always client-only', () => {
    // Even with BOTH recipient toggles off, the client-facing status_change and
    // blocked templates force effective {toClient:true, toInternal:false}. The
    // per-trigger enablement bool (statusChange/blocked) is the real off switch.
    const taskData = {
      title: 'T',
      status: 'in_progress',
      sendWhatsapp: true,
      assignees: [{ type: 'user', id: 'u1', name: 'Alice' }],
      notify: { statusChange: true, dueSoon: true, blocked: true, toClient: false, toInternal: false },
    };
    const planned = planTaskNotifications(
      input({ taskData, memberProfiles: new Map([['u1', { phone: '+60122222222' }]]) }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({ recipientType: 'client', recipientId: 'client1' });
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
    // No waConsent either — opt_out takes precedence over no_consent (#26).
    const planned = planTaskNotifications(
      input({ clients: [{ id: 'client1', data: { phone: '+60123456789', notificationsOptOut: true } }] }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({ suppressed: true, suppressedReason: 'opt_out' });
  });

  it('suppresses with no_consent for a client without a waConsent grant (#26 D2)', () => {
    const planned = planTaskNotifications(
      input({ clients: [{ id: 'client1', data: { name: 'Ahmad', phone: '+60123456789' } }] }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      suppressed: true,
      suppressedReason: 'no_consent',
      recipientType: 'client',
    });
  });

  it('treats a granted:false refusal record as no_consent (#26 D2)', () => {
    const planned = planTaskNotifications(
      input({
        clients: [
          { id: 'client1', data: { name: 'Ahmad', phone: '+60123456789', waConsent: { granted: false } } },
        ],
      }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({ suppressed: true, suppressedReason: 'no_consent' });
  });

  it('reports no_consent (not no_phone) for a resolvable but unconsented client', () => {
    const planned = planTaskNotifications(
      input({ clients: [{ id: 'client1', data: { name: 'Ahmad' } }] }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({ suppressed: true, suppressedReason: 'no_consent' });
  });

  it('suppresses with no_recipient when the linked client doc is missing', () => {
    const planned = planTaskNotifications(
      input({
        projectData: { name: 'P', lifecycle: 'published', clientId: 'client1', clientIds: ['client1'] },
        clients: [{ id: 'client1', data: undefined }],
      }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      suppressed: true,
      suppressedReason: 'no_recipient',
      recipientType: 'client',
      recipientId: 'client1',
    });
  });

  it('writes no client record when the project has no linked client', () => {
    const planned = planTaskNotifications(
      input({
        projectData: { name: 'P', lifecycle: 'published', clientId: '', clientIds: [] },
        clients: [],
      }),
    );
    expect(planned).toEqual([]);
  });

  it('suppresses with no_phone for a member assignee without a profile phone (D7)', () => {
    // #142 Q4: member routing now lives on task_due_soon (the internal-only
    // trigger); status_change/blocked are client-only.
    const taskData = {
      title: 'T',
      status: 'todo',
      sendWhatsapp: true,
      assignees: [{ type: 'user', id: 'u1', name: 'Alice' }],
      dueDate: { toDate: () => new Date('2026-07-24T04:00:00Z') },
      notify: { statusChange: true, dueSoon: true, blocked: true, toClient: false, toInternal: true },
    };
    const planned = planTaskNotifications(
      input({
        trigger: 'task_due_soon',
        taskData,
        memberProfiles: new Map([['u1', { displayName: 'Alice' }]]),
      }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      suppressed: true,
      suppressedReason: 'no_phone',
      recipientType: 'member',
      recipientId: 'u1',
    });
  });

  it('exempts firm members from the consent gate (#26 D2 contract basis)', () => {
    // #142 Q4: member routing is exercised via task_due_soon (internal-only).
    const taskData = {
      title: 'T',
      status: 'todo',
      sendWhatsapp: true,
      assignees: [{ type: 'user', id: 'u1', name: 'Alice' }],
      dueDate: { toDate: () => new Date('2026-07-24T04:00:00Z') },
      notify: { statusChange: true, dueSoon: true, blocked: true, toClient: false, toInternal: true },
    };
    // Member profile has a phone but no waConsent — still queued.
    const planned = planTaskNotifications(
      input({
        trigger: 'task_due_soon',
        taskData,
        memberProfiles: new Map([['u1', { phone: '+60122222222' }]]),
      }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({ status: 'queued', recipientType: 'member' });
    expect(planned[0].data).not.toHaveProperty('suppressed');
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
        task_title: 'Pour foundation',
        project_title: 'Bungalow Reno',
        new_status: 'in_progress',
        firm_name: 'Acme Builders',
      },
    });
  });

  it('#142 Q4: status_change with toClient+toInternal BOTH on STILL routes client-only', () => {
    // Members are excluded from the client-facing status_change/blocked templates
    // regardless of toInternal — they must never receive a client portal_token.
    const taskData = {
      title: 'T',
      status: 'in_progress',
      sendWhatsapp: true,
      assignees: [
        { type: 'user', id: 'u1', name: 'Alice' },
        { type: 'user', id: 'u2', name: 'Sam' },
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
    expect(planned).toHaveLength(1);
    expect(planned.map((m) => (m.data as { recipientType: string }).recipientType)).toEqual([
      'client',
    ]);
  });

  // #142 Q4 (Tester gap): the workspace toggles are inverted — toInternal:true,
  // toClient:false. A naive router would fan out to members ONLY. The client-only
  // override must ignore both toggles: the member never receives status_change /
  // blocked (they'd otherwise get a client portal_token), and the client is the
  // sole recipient even though toClient is OFF.
  for (const trigger of ['task_status_change', 'task_blocked'] as const) {
    it(`#142 Q4: ${trigger} with toInternal:true,toClient:false STILL routes client-only (member excluded)`, () => {
      const taskData = {
        title: 'T',
        status: trigger === 'task_blocked' ? 'blocked' : 'in_progress',
        sendWhatsapp: true,
        blockedReason: 'Waiting on materials',
        assignees: [{ type: 'user', id: 'u1', name: 'Alice' }],
        notify: { statusChange: true, dueSoon: true, blocked: true, toClient: false, toInternal: true },
      };
      const planned = planTaskNotifications(
        input({
          trigger,
          taskData,
          memberProfiles: new Map([['u1', { phone: '+60122222222' }]]),
        }),
      );
      expect(planned).toHaveLength(1);
      expect(planned[0].data).toMatchObject({ recipientType: 'client', recipientId: 'client1' });
      // No member record was produced despite toInternal:true.
      expect(planned.some((m) => (m.data as { recipientType: string }).recipientType === 'member')).toBe(
        false,
      );
    });
  }

  it('uses deterministic dedupe ids for task_due_soon only (D5)', () => {
    // #137 Part D: due-soon is internal-only, so the deterministic id keys off
    // the MEMBER recipient (pre-Part D this asserted client_client1).
    const dueSoonTask = {
      title: 'T',
      status: 'todo',
      sendWhatsapp: true,
      assignees: [{ type: 'user', id: 'u1', name: 'Alice' }],
      dueDate: { toDate: () => new Date('2026-07-24T04:00:00Z') },
    };
    const dueSoonInput = () =>
      input({
        trigger: 'task_due_soon',
        taskData: dueSoonTask,
        memberProfiles: new Map([['u1', { phone: '+60122222222' }]]),
      });
    const planned = planTaskNotifications(dueSoonInput());
    expect(planned).toHaveLength(1);
    expect(planned[0].id).toBe('dueSoon_p1_t1_2026-07-23_member_u1');
    expect(planned[0].data).toMatchObject({ dedupeKey: 'dueSoon_p1_t1_2026-07-23_member_u1' });
    // Same inputs → same id (re-run cannot double-enqueue).
    expect(planTaskNotifications(dueSoonInput())[0].id).toBe(planned[0].id);
    // Status-change events use auto ids.
    expect(planTaskNotifications(input())[0].id).toBeNull();
  });
});

describe('planTaskNotifications — #157 multi-client fan-out (trigger path)', () => {
  // Two co-equal clients on distinct phones, each carrying its OWN durable
  // portal token (enqueueTaskEvent mints one per sendable client). The pure
  // planner must fan out one message per client with no cross-client bleed.
  const twoDistinct = [
    {
      id: 'c1',
      data: { name: 'Ann Lee', phone: '+60111111111', waConsent: { granted: true } },
      portalToken: 'tokAAAA1111_c2VjcmV0',
    },
    {
      id: 'c2',
      data: { name: 'Ben Tan', phone: '+60222222222', waConsent: { granted: true } },
      portalToken: 'tokBBBB2222_c2VjcmV0',
    },
  ];

  it('D3: fans out one queued client record per linked client (distinct phones)', () => {
    const planned = planTaskNotifications(input({ clients: twoDistinct }));
    expect(planned).toHaveLength(2);
    for (const message of planned) {
      expect(message.data['recipientType']).toBe('client');
      expect(message.data).not.toHaveProperty('suppressed');
    }
    expect(planned.map((m) => m.data['recipientId'])).toEqual(['c1', 'c2']);
    expect(planned.map((m) => m.data['recipientPhone'])).toEqual([
      '+60111111111',
      '+60222222222',
    ]);
    // Two distinct sends ⇒ two allowance draws (one decrement per sent message).
    expect(planned.filter((m) => m.data['suppressed'] !== true)).toHaveLength(2);
  });

  it('D9: each message embeds only its OWN client portal token — no cross-client leak', () => {
    const planned = planTaskNotifications(input({ clients: twoDistinct }));
    const tokens = planned.map(
      (m) => (m.data['variables'] as Record<string, string>)['portal_token'],
    );
    expect(tokens).toEqual(['tokAAAA1111_c2VjcmV0', 'tokBBBB2222_c2VjcmV0']);
    // c1's message must not carry c2's token and vice versa.
    expect(tokens[0]).not.toBe(tokens[1]);
    expect(JSON.stringify(planned[0].data['variables'])).not.toContain('tokBBBB2222');
    expect(JSON.stringify(planned[1].data['variables'])).not.toContain('tokAAAA1111');
  });

  it('D4: de-dupes the WhatsApp SEND when two clients share a normalized phone', () => {
    const shared = [
      {
        id: 'c1',
        data: { name: 'Ann Lee', phone: '+60123456789', waConsent: { granted: true } },
        portalToken: 'tokAAAA1111_c2VjcmV0',
      },
      {
        id: 'c2',
        data: { name: 'Ben Tan', phone: ' +60123456789 ', waConsent: { granted: true } },
        portalToken: 'tokBBBB2222_c2VjcmV0',
      },
    ];
    const planned = planTaskNotifications(input({ clients: shared }));
    expect(planned).toHaveLength(2);
    // First client on the number sends; the second collapses to a suppressed
    // 'duplicate_phone' record (audit trail, but never sent / never billed).
    expect(planned[0].data).not.toHaveProperty('suppressed');
    expect(planned[0].data['recipientId']).toBe('c1');
    expect(planned[1].data).toMatchObject({
      suppressed: true,
      suppressedReason: 'duplicate_phone',
      recipientId: 'c2',
    });
    // Exactly ONE non-suppressed record ⇒ exactly ONE allowance draw (D4).
    expect(planned.filter((m) => m.data['suppressed'] !== true)).toHaveLength(1);
  });

  it('gates each client independently on its own opt-out / consent / phone', () => {
    const mixed = [
      {
        id: 'c1',
        data: { name: 'Ann Lee', phone: '+60111111111', waConsent: { granted: true } },
        portalToken: 'tokAAAA1111_c2VjcmV0',
      },
      // opted out — suppressed regardless of consent/phone.
      {
        id: 'c2',
        data: {
          name: 'Ben Tan',
          phone: '+60222222222',
          waConsent: { granted: true },
          notificationsOptOut: true,
        },
      },
      // no waConsent grant (#26 D2).
      { id: 'c3', data: { name: 'Cai Wong', phone: '+60333333333' } },
      // consented but no phone on file.
      { id: 'c4', data: { name: 'Dee Ong', waConsent: { granted: true } } },
    ];
    const planned = planTaskNotifications(input({ clients: mixed }));
    expect(planned).toHaveLength(4);
    expect(planned[0].data).not.toHaveProperty('suppressed');
    expect(planned[1].data).toMatchObject({ suppressed: true, suppressedReason: 'opt_out' });
    expect(planned[2].data).toMatchObject({ suppressed: true, suppressedReason: 'no_consent' });
    expect(planned[3].data).toMatchObject({ suppressed: true, suppressedReason: 'no_phone' });
    // Only the one eligible client draws allowance; the rest are suppressed.
    expect(planned.filter((m) => m.data['suppressed'] !== true)).toHaveLength(1);
  });

  it('a draft project suppresses ALL clients with lifecycle:<state> (D-027, no leak)', () => {
    const planned = planTaskNotifications(
      input({
        clients: twoDistinct,
        projectData: { name: 'Bungalow Reno', lifecycle: 'draft', clientIds: ['c1', 'c2'] },
      }),
    );
    expect(planned).toHaveLength(2);
    for (const message of planned) {
      expect(message.data).toMatchObject({ suppressed: true, suppressedReason: 'lifecycle:draft' });
    }
  });
});

describe('planTaskNotifications — #137 Part D: task_due_soon is INTERNAL-ONLY', () => {
  const MEMBERS = new Map<string, Record<string, unknown> | undefined>([
    ['u1', { phone: '+60122222222' }],
    ['u2', { phone: '+60133333333' }],
  ]);

  function dueSoonTask(notify?: Record<string, unknown>): Record<string, unknown> {
    return {
      title: 'Inspection',
      status: 'todo',
      sendWhatsapp: true,
      assignees: [
        { type: 'user', id: 'u1', name: 'Alice' },
        { type: 'user', id: 'u2', name: 'Sam' },
      ],
      dueDate: { toDate: () => new Date('2026-07-24T04:00:00Z') },
      ...(notify ? { notify } : {}),
    };
  }

  it('routes to the task assignees (members) only — never a client', () => {
    const planned = planTaskNotifications(
      input({ trigger: 'task_due_soon', taskData: dueSoonTask(), memberProfiles: MEMBERS }),
    );
    expect(planned).toHaveLength(2);
    expect(planned.map((m) => (m.data as { recipientType: string }).recipientType)).toEqual([
      'member',
      'member',
    ]);
    expect(planned.map((m) => (m.data as { recipientId: string }).recipientId)).toEqual([
      'u1',
      'u2',
    ]);
    // No client recipient is ever produced for due-soon.
    expect(
      planned.some((m) => (m.data as { recipientType: string }).recipientType === 'client'),
    ).toBe(false);
  });

  it('ignores config: toClient:true, toInternal:false STILL routes to members only', () => {
    const notify = {
      statusChange: true,
      dueSoon: true,
      blocked: true,
      toClient: true,
      toInternal: false,
    };
    const planned = planTaskNotifications(
      input({ trigger: 'task_due_soon', taskData: dueSoonTask(notify), memberProfiles: MEMBERS }),
    );
    expect(planned).toHaveLength(2);
    expect(
      planned.every((m) => (m.data as { recipientType: string }).recipientType === 'member'),
    ).toBe(true);
    expect(
      planned.some((m) => (m.data as { recipientType: string }).recipientType === 'client'),
    ).toBe(false);
  });

  it('still respects notify.dueSoon disabled (no enqueue)', () => {
    const notify = {
      statusChange: true,
      dueSoon: false,
      blocked: true,
      toClient: true,
      toInternal: false,
    };
    expect(
      planTaskNotifications(
        input({ trigger: 'task_due_soon', taskData: dueSoonTask(notify), memberProfiles: MEMBERS }),
      ),
    ).toEqual([]);
  });

  it('still respects sendWhatsapp === false (no enqueue)', () => {
    const taskData = { ...dueSoonTask(), sendWhatsapp: false };
    expect(
      planTaskNotifications(
        input({ trigger: 'task_due_soon', taskData, memberProfiles: MEMBERS }),
      ),
    ).toEqual([]);
  });

  it('still suppresses an opted-out member with opt_out', () => {
    const planned = planTaskNotifications(
      input({
        trigger: 'task_due_soon',
        taskData: dueSoonTask(),
        memberProfiles: new Map<string, Record<string, unknown> | undefined>([
          ['u1', { phone: '+60122222222', notificationsOptOut: true }],
          ['u2', { phone: '+60133333333' }],
        ]),
      }),
    );
    expect(planned).toHaveLength(2);
    const u1 = planned.find((m) => (m.data as { recipientId: string }).recipientId === 'u1');
    expect(u1?.data).toMatchObject({
      suppressed: true,
      suppressedReason: 'opt_out',
      recipientType: 'member',
    });
    const u2 = planned.find((m) => (m.data as { recipientId: string }).recipientId === 'u2');
    expect(u2?.data).not.toHaveProperty('suppressed');
  });

  it('still suppresses billing read-only workspaces for due-soon members', () => {
    const planned = planTaskNotifications(
      input({
        trigger: 'task_due_soon',
        taskData: dueSoonTask(),
        memberProfiles: MEMBERS,
        billingReadOnly: true,
      }),
    );
    expect(planned).toHaveLength(2);
    expect(
      planned.every(
        (m) => (m.data as { suppressedReason?: string }).suppressedReason === 'billing',
      ),
    ).toBe(true);
  });

  it('leaves task_status_change routing UNCHANGED — client by default per config', () => {
    // Default notify (absent map) → toClient:true, toInternal:false. Part D must
    // NOT touch this path: the status-change record is still the client's.
    const planned = planTaskNotifications(
      input({ trigger: 'task_status_change', taskData: dueSoonTask(), memberProfiles: MEMBERS }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      recipientType: 'client',
      recipientId: 'client1',
      trigger: 'task_status_change',
    });
  });

  it('leaves task_blocked routing UNCHANGED — client by default per config', () => {
    const planned = planTaskNotifications(
      input({
        trigger: 'task_blocked',
        taskData: { ...dueSoonTask(), status: 'blocked', blockedReason: 'Waiting on materials' },
        memberProfiles: MEMBERS,
      }),
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({
      recipientType: 'client',
      recipientId: 'client1',
      trigger: 'task_blocked',
    });
  });

  it('Case C: fans out one deterministic per-member dedupe id, no client record', () => {
    // Three members prove the id keys off EACH recipient.id (not a shared task id).
    const taskData = {
      title: 'Inspection',
      status: 'todo',
      sendWhatsapp: true,
      assignees: [
        { type: 'user', id: 'u1', name: 'Alice' },
        { type: 'user', id: 'u2', name: 'Sam' },
        { type: 'user', id: 'u3', name: 'Priya' },
      ],
      dueDate: { toDate: () => new Date('2026-07-24T04:00:00Z') },
    };
    const planned = planTaskNotifications(
      input({
        trigger: 'task_due_soon',
        taskData,
        memberProfiles: new Map<string, Record<string, unknown> | undefined>([
          ['u1', { phone: '+60122222222' }],
          ['u2', { phone: '+60133333333' }],
          ['u3', { phone: '+60144444444' }],
        ]),
      }),
    );
    expect(planned).toHaveLength(3);
    // One record per member, no client.
    expect(planned.every((m) => (m.data as { recipientType: string }).recipientType === 'member')).toBe(
      true,
    );
    // Deterministic, per-member, and all distinct.
    const ids = planned.map((m) => m.id);
    expect(ids).toEqual([
      'dueSoon_p1_t1_2026-07-23_member_u1',
      'dueSoon_p1_t1_2026-07-23_member_u2',
      'dueSoon_p1_t1_2026-07-23_member_u3',
    ]);
    expect(new Set(ids).size).toBe(3);
    // dedupeKey mirrors the id on every record.
    expect(planned.map((m) => (m.data as { dedupeKey: string }).dedupeKey)).toEqual(ids);
  });

  it('Case B: a draft project suppresses due_soon MEMBERS with lifecycle:<state> (flagged follow-up is current behavior)', () => {
    const planned = planTaskNotifications(
      input({
        trigger: 'task_due_soon',
        taskData: dueSoonTask(),
        projectData: { name: 'P', lifecycle: 'draft', clientId: 'client1' },
        memberProfiles: MEMBERS,
      }),
    );
    expect(planned).toHaveLength(2);
    expect(
      planned.every(
        (m) =>
          (m.data as { recipientType: string }).recipientType === 'member' &&
          (m.data as { suppressed?: boolean }).suppressed === true &&
          (m.data as { suppressedReason?: string }).suppressedReason === 'lifecycle:draft',
      ),
    ).toBe(true);
  });
});


describe('templateVariables — snake_case wire contract (#137/#142)', () => {
  // The variable KEYS are the wire contract: they must match the approved Meta
  // template's named variables EXACTLY. #142 (Part B): status_change/blocked now
  // emit the bare durable `portal_token`; NO full-URL link var is ever emitted.
  const LINK_KEYS = ['portal_link', 'task_link', 'portalLink', 'taskLink'];

  function varsFor(
    trigger: 'task_status_change' | 'task_blocked' | 'task_due_soon',
    taskData: Record<string, unknown>,
    memberProfiles?: ReadonlyMap<string, Record<string, unknown> | undefined>,
  ) {
    const planned = planTaskNotifications(
      input(memberProfiles ? { trigger, taskData, memberProfiles } : { trigger, taskData }),
    );
    expect(planned).toHaveLength(1);
    return planned[0].data['variables'] as Record<string, string>;
  }

  it('task_status_change emits snake_case vars incl. the bare portal_token (#142)', () => {
    const planned = planTaskNotifications(
      input({
        trigger: 'task_status_change',
        taskData: {
          title: 'Pour foundation',
          status: 'in_progress',
          sendWhatsapp: true,
          assignees: [],
        },
        clients: [
          {
            id: 'client1',
            data: { name: 'Ahmad', phone: '+60123456789', waConsent: { granted: true } },
            portalToken: 'abcdEFGH2345_c2VjcmV0',
          },
        ],
      }),
    );
    expect(planned).toHaveLength(1);
    const variables = planned[0].data['variables'] as Record<string, string>;
    expect(variables).toEqual({
      task_title: 'Pour foundation',
      project_title: 'Bungalow Reno',
      firm_name: 'Acme Builders',
      new_status: 'in_progress',
      portal_token: 'abcdEFGH2345_c2VjcmV0',
    });
    // Bare token, never a full URL.
    expect(variables['portal_token']).not.toMatch(/^https?:/);
    expect(variables['portal_token']).not.toContain('/p/');
    for (const key of LINK_KEYS) {
      expect(variables).not.toHaveProperty(key);
    }
  });

  it('task_status_change emits an EMPTY portal_token when unresolved (suppressed/draft never sends)', () => {
    const variables = varsFor('task_status_change', {
      title: 'T',
      status: 'in_progress',
      sendWhatsapp: true,
      assignees: [],
    });
    expect(variables['portal_token']).toBe('');
  });

  it('task_blocked emits snake_case blocked_reason AND the bare portal_token (#142 Q2 keeps blocked_reason)', () => {
    const planned = planTaskNotifications(
      input({
        trigger: 'task_blocked',
        taskData: {
          title: 'Wiring',
          status: 'blocked',
          sendWhatsapp: true,
          assignees: [],
          blockedReason: 'Waiting on materials',
        },
        clients: [
          {
            id: 'client1',
            data: { name: 'Ahmad', phone: '+60123456789', waConsent: { granted: true } },
            portalToken: 'abcdEFGH2345_c2VjcmV0',
          },
        ],
      }),
    );
    expect(planned).toHaveLength(1);
    const variables = planned[0].data['variables'] as Record<string, string>;
    expect(variables).toEqual({
      task_title: 'Wiring',
      project_title: 'Bungalow Reno',
      firm_name: 'Acme Builders',
      blocked_reason: 'Waiting on materials',
      portal_token: 'abcdEFGH2345_c2VjcmV0',
    });
    for (const key of LINK_KEYS) {
      expect(variables).not.toHaveProperty(key);
    }
    // No cross-trigger key leakage.
    expect(variables).not.toHaveProperty('new_status');
  });

  it('task_due_soon emits snake_case MYT due_date and NO link var', () => {
    // #137 Part D: due-soon is internal-only, so it needs a member assignee to
    // produce a record (empty assignees would now yield zero records).
    const variables = varsFor(
      'task_due_soon',
      {
        title: 'Inspection',
        status: 'todo',
        sendWhatsapp: true,
        assignees: [{ type: 'user', id: 'u1', name: 'Alice' }],
        dueDate: { toDate: () => new Date('2026-07-24T04:00:00Z') },
      },
      new Map([['u1', { phone: '+60122222222' }]]),
    );
    expect(variables).toMatchObject({
      task_title: 'Inspection',
      project_title: 'Bungalow Reno',
      firm_name: 'Acme Builders',
      due_date: '2026-07-24',
    });
    for (const key of LINK_KEYS) {
      expect(variables).not.toHaveProperty(key);
    }
    // #142: task_due_soon stays link-less — no portal_token (Part D unchanged).
    expect(variables).not.toHaveProperty('portal_token');
    expect(variables).not.toHaveProperty('new_status');
    expect(variables).not.toHaveProperty('blocked_reason');
  });

  it('never emits legacy camelCase keys on any wired trigger', () => {
    const legacy = ['taskTitle', 'projectTitle', 'firmName', 'newStatus', 'blockedReason', 'dueDate'];
    const status = varsFor('task_status_change', {
      title: 'T', status: 'in_progress', sendWhatsapp: true, assignees: [],
    });
    for (const key of legacy) {
      expect(status).not.toHaveProperty(key);
    }
  });
});
