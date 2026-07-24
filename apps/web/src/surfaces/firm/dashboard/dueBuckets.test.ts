import { describe, expect, it } from 'vitest';

import { TASK_NOTIFY_DEFAULTS } from '@siapp/shared';

import type { IDashboardTaskRow } from './useDashboardTasks.ts';
import { WEEK_MS, bucketTasks } from './dueBuckets.ts';

const NOW = new Date('2026-07-20T12:00:00.000Z');
const UID = 'u1';

function taskRow(overrides: Partial<IDashboardTaskRow> = {}): IDashboardTaskRow {
  return {
    restricted: false,
    id: 't1',
    title: 'Pour foundation',
    description: '',
    phaseId: null,
    status: 'todo',
    startDate: null,
    dueDate: null,
    completedAt: null,
    assignees: [{ type: 'user', id: UID, name: 'Alice Tan' }],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: { ...TASK_NOTIFY_DEFAULTS },
    dependsOn: [],
    order: 0,
    createdBy: UID,
    blockedReason: '',
    projectId: 'p1',
    projectName: 'Bungalow build',
    ...overrides,
  };
}

function offset(ms: number): Date {
  return new Date(NOW.getTime() + ms);
}

describe('bucketTasks', () => {
  it('puts past-due tasks in overdue and boundary now in dueThisWeek', () => {
    const buckets = bucketTasks(
      [
        taskRow({ id: 'past', dueDate: offset(-1) }),
        taskRow({ id: 'at-now', dueDate: offset(0) }),
      ],
      UID,
      NOW,
    );
    expect(buckets.overdue.map((t) => t.id)).toEqual(['past']);
    expect(buckets.dueThisWeek.map((t) => t.id)).toEqual(['at-now']);
    expect(buckets.myOpen).toEqual([]);
  });

  it('treats the 7-day boundary as exclusive', () => {
    const buckets = bucketTasks(
      [
        taskRow({ id: 'inside', dueDate: offset(WEEK_MS - 1) }),
        taskRow({ id: 'at-boundary', dueDate: offset(WEEK_MS) }),
        taskRow({ id: 'later', dueDate: offset(WEEK_MS + 1) }),
      ],
      UID,
      NOW,
    );
    expect(buckets.dueThisWeek.map((t) => t.id)).toEqual(['inside']);
    expect(buckets.myOpen.map((t) => t.id)).toEqual(['at-boundary', 'later']);
    expect(buckets.overdue).toEqual([]);
  });

  it('excludes done tasks from every bucket', () => {
    const buckets = bucketTasks(
      [
        taskRow({ id: 'done-past', status: 'done', dueDate: offset(-1) }),
        taskRow({ id: 'done-soon', status: 'done', dueDate: offset(1) }),
        taskRow({ id: 'done-undated', status: 'done' }),
      ],
      UID,
      NOW,
    );
    expect(buckets.myOpen).toEqual([]);
    expect(buckets.overdue).toEqual([]);
    expect(buckets.dueThisWeek).toEqual([]);
  });

  it('excludes tasks assigned to other users or to collaborators', () => {
    const buckets = bucketTasks(
      [
        taskRow({ id: 'other-user', assignees: [{ type: 'user', id: 'u2', name: 'Bob' }] }),
        taskRow({
          id: 'collab',
          assignees: [{ type: 'collaborator', id: UID, name: 'Not me', phone: '+60123456789' }],
        }),
        taskRow({ id: 'unassigned', assignees: [] }),
        taskRow({
          id: 'mine-among-many',
          assignees: [
            { type: 'user', id: 'u2', name: 'Bob' },
            { type: 'user', id: UID, name: 'Alice Tan' },
          ],
        }),
      ],
      UID,
      NOW,
    );
    expect(buckets.myOpen.map((t) => t.id)).toEqual(['mine-among-many']);
    expect(buckets.overdue).toEqual([]);
    expect(buckets.dueThisWeek).toEqual([]);
  });

  it('puts undated tasks in myOpen only', () => {
    const buckets = bucketTasks([taskRow({ id: 'undated', dueDate: null })], UID, NOW);
    expect(buckets.myOpen.map((t) => t.id)).toEqual(['undated']);
    expect(buckets.overdue).toEqual([]);
    expect(buckets.dueThisWeek).toEqual([]);
  });

  it('sorts each bucket by due date ascending with nulls last, then order', () => {
    const buckets = bucketTasks(
      [
        taskRow({ id: 'undated-b', dueDate: null, order: 2 }),
        taskRow({ id: 'undated-a', dueDate: null, order: 1 }),
        taskRow({ id: 'far', dueDate: offset(WEEK_MS + 2000), order: 0 }),
        taskRow({ id: 'overdue-newer', dueDate: offset(-1000), order: 5 }),
        taskRow({ id: 'overdue-older', dueDate: offset(-2000), order: 9 }),
      ],
      UID,
      NOW,
    );
    expect(buckets.overdue.map((t) => t.id)).toEqual(['overdue-older', 'overdue-newer']);
    expect(buckets.myOpen.map((t) => t.id)).toEqual(['far', 'undated-a', 'undated-b']);
  });
});
