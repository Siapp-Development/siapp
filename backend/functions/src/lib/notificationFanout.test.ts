/**
 * Unit tests for the pure notification fan-out helpers (#134). No emulator —
 * these cover the kind mapping, recipient resolution (department gating,
 * actor exclusion, dedupe, mention priority) and the retention selection.
 */

import { describe, expect, it } from 'vitest';

import {
  canReceive,
  kindForActivity,
  notificationsToTrim,
  resolveRecipients,
  userAssigneeUids,
  type IMemberInfo,
} from './notificationFanout.js';

function member(uid: string, role: IMemberInfo['role'], departments: string[] = []): IMemberInfo {
  return { uid, role, departments };
}

function indexOf(...members: IMemberInfo[]): Map<string, IMemberInfo> {
  return new Map(members.map((m) => [m.uid, m]));
}

describe('kindForActivity', () => {
  it('maps assignment, lifecycle and collaborator actions to their kinds', () => {
    expect(kindForActivity('task_assigned')).toBe('task_assigned');
    expect(kindForActivity('client_document_uploaded')).toBe('client_document_uploaded');
    expect(kindForActivity('collaborator_note_added')).toBe('collaborator_note_added');
    expect(kindForActivity('collaborator_need_help')).toBe('collaborator_need_help');
    expect(kindForActivity('project_published')).toBe('project_published');
    expect(kindForActivity('project_completed')).toBe('project_completed');
    expect(kindForActivity('project_archived')).toBe('project_archived');
  });

  it('maps a status change into blocked vs generic status', () => {
    expect(kindForActivity('task_status_changed', 'blocked')).toBe('task_blocked');
    expect(kindForActivity('task_status_changed', 'in_progress')).toBe('task_status_changed');
    expect(kindForActivity('task_status_changed', null)).toBe('task_status_changed');
  });

  it('ignores unmapped actions', () => {
    expect(kindForActivity('task_created')).toBeNull();
    expect(kindForActivity('task_unassigned')).toBeNull();
    expect(kindForActivity('project_created')).toBeNull();
    expect(kindForActivity('doc_deleted')).toBeNull();
  });
});

describe('canReceive (department gate mirror)', () => {
  it('always admits owner/admin regardless of restrictions', () => {
    expect(canReceive(member('o', 'owner'), ['finance'])).toBe(true);
    expect(canReceive(member('a', 'admin'), ['finance'])).toBe(true);
  });

  it('admits everyone when unrestricted', () => {
    expect(canReceive(member('p', 'pm'), [])).toBe(true);
    expect(canReceive(member('v', 'viewer', ['legal']), [])).toBe(true);
  });

  it('admits a pm/viewer only on department intersection', () => {
    expect(canReceive(member('p', 'pm', ['finance']), ['finance'])).toBe(true);
    expect(canReceive(member('p', 'pm', ['legal']), ['finance'])).toBe(false);
    expect(canReceive(member('p', 'pm', []), ['finance'])).toBe(false);
  });
});

describe('resolveRecipients', () => {
  it('resolves newly-assigned members for an assignment', () => {
    const result = resolveRecipients({
      kind: 'task_assigned',
      actorId: 'actor',
      restrictedToDepartments: [],
      memberIndex: indexOf(member('u1', 'pm'), member('u2', 'pm')),
      taskAssigneeUids: ['u1', 'u2'],
    });
    expect(result.map((r) => r.uid)).toEqual(['u1', 'u2']);
    expect(result.every((r) => r.kind === 'task_assigned')).toBe(true);
  });

  it('unions assignees and prior commenters for a status change', () => {
    const result = resolveRecipients({
      kind: 'task_status_changed',
      actorId: 'actor',
      restrictedToDepartments: [],
      memberIndex: indexOf(member('u1', 'pm'), member('u2', 'pm'), member('u3', 'pm')),
      taskAssigneeUids: ['u1', 'u2'],
      priorCommenterUids: ['u3'],
    });
    expect(result.map((r) => r.uid)).toEqual(['u1', 'u2', 'u3']);
  });

  it('excludes the actor from the recipient set', () => {
    const result = resolveRecipients({
      kind: 'task_status_changed',
      actorId: 'u1',
      restrictedToDepartments: [],
      memberIndex: indexOf(member('u1', 'pm'), member('u2', 'pm')),
      taskAssigneeUids: ['u1', 'u2'],
    });
    expect(result.map((r) => r.uid)).toEqual(['u2']);
  });

  it('dedupes a uid that is both assignee and prior commenter', () => {
    const result = resolveRecipients({
      kind: 'task_status_changed',
      actorId: 'actor',
      restrictedToDepartments: [],
      memberIndex: indexOf(member('u1', 'pm')),
      taskAssigneeUids: ['u1'],
      priorCommenterUids: ['u1'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ uid: 'u1', kind: 'task_status_changed' });
  });

  it('gives a mentioned assignee the mention kind (priority over watcher)', () => {
    const result = resolveRecipients({
      kind: 'task_comment',
      actorId: 'actor',
      restrictedToDepartments: [],
      memberIndex: indexOf(member('u1', 'pm'), member('u2', 'pm')),
      taskAssigneeUids: ['u1', 'u2'],
      mentionedUids: ['u2'],
    });
    const byUid = new Map(result.map((r) => [r.uid, r.kind]));
    expect(byUid.get('u1')).toBe('task_comment');
    expect(byUid.get('u2')).toBe('mention');
  });

  it('applies the department gate to a restricted event', () => {
    const result = resolveRecipients({
      kind: 'task_status_changed',
      actorId: 'actor',
      restrictedToDepartments: ['finance'],
      memberIndex: indexOf(
        member('owner1', 'owner'),
        member('inFinance', 'pm', ['finance']),
        member('notFinance', 'pm', ['legal']),
      ),
      taskAssigneeUids: ['owner1', 'inFinance', 'notFinance'],
    });
    expect(result.map((r) => r.uid)).toEqual(['inFinance', 'owner1']);
  });

  it('drops candidates that are not firm members', () => {
    const result = resolveRecipients({
      kind: 'task_status_changed',
      actorId: 'actor',
      restrictedToDepartments: [],
      memberIndex: indexOf(member('u1', 'pm')),
      taskAssigneeUids: ['u1', 'ghost'],
    });
    expect(result.map((r) => r.uid)).toEqual(['u1']);
  });

  it('resolves project participants for a lifecycle event', () => {
    const result = resolveRecipients({
      kind: 'project_published',
      actorId: 'actor',
      restrictedToDepartments: [],
      memberIndex: indexOf(member('owner1', 'owner'), member('u1', 'pm')),
      projectParticipantUids: ['owner1', 'u1'],
    });
    expect(result.map((r) => r.uid)).toEqual(['owner1', 'u1']);
    expect(result.every((r) => r.kind === 'project_published')).toBe(true);
  });
});

describe('notificationsToTrim', () => {
  it('marks docs beyond the latest 100 for deletion', () => {
    const candidates = Array.from({ length: 105 }, (_, i) => ({
      id: `n${i}`,
      atMs: 1_000_000 - i,
    }));
    const ids = notificationsToTrim(candidates, 1_000_000);
    expect(ids).toEqual(['n100', 'n101', 'n102', 'n103', 'n104']);
  });

  it('marks docs older than 90 days for deletion', () => {
    const now = 1_000_000_000_000;
    const dayMs = 86_400_000;
    const candidates = [
      { id: 'recent', atMs: now - 10 * dayMs },
      { id: 'old', atMs: now - 91 * dayMs },
      { id: 'pending', atMs: null },
    ];
    expect(notificationsToTrim(candidates, now)).toEqual(['old']);
  });
});

describe('userAssigneeUids', () => {
  it('extracts distinct user-type assignee uids only', () => {
    expect(
      userAssigneeUids([
        { type: 'user', id: 'u1', name: 'A' },
        { type: 'collaborator', id: 'c1', name: 'C' },
        { type: 'user', id: 'u1', name: 'A' },
        { type: 'user', id: 'u2', name: 'B' },
      ]),
    ).toEqual(['u1', 'u2']);
  });

  it('returns [] for non-array input', () => {
    expect(userAssigneeUids(undefined)).toEqual([]);
  });
});
