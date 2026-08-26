/**
 * Q1 ordering for the "My Assigned Tasks" switcher (#127): active-first
 * (active = status !== 'done') → due date ascending (missing due last) → title.
 */
import { describe, expect, it } from 'vitest';

import { compareAssignedTasks, type IAssignedTaskRow } from './useCollabAssignedTasks.ts';

function row(overrides: Partial<IAssignedTaskRow>): IAssignedTaskRow {
  const status = overrides.status ?? 'todo';
  return {
    key: overrides.key ?? overrides.taskId ?? 't',
    projectId: 'p1',
    taskId: overrides.taskId ?? 't',
    title: overrides.title ?? 'Task',
    status,
    dueDate: overrides.dueDate ?? null,
    projectName: 'Tower A',
    active: status !== 'done',
    ...overrides,
  };
}

function sortTitles(rows: IAssignedTaskRow[]): string[] {
  return [...rows].sort(compareAssignedTasks).map((r) => r.title);
}

describe('compareAssignedTasks', () => {
  it('puts active tasks (status !== done) before completed ones', () => {
    const done = row({ title: 'Done work', status: 'done' });
    const active = row({ title: 'Active work', status: 'in_progress' });
    expect(sortTitles([done, active])).toEqual(['Active work', 'Done work']);
  });

  it('orders same-activity tasks by due date ascending, missing due last', () => {
    const early = row({ title: 'Early', dueDate: new Date('2026-01-01') });
    const late = row({ title: 'Late', dueDate: new Date('2026-06-01') });
    const noDue = row({ title: 'No due', dueDate: null });
    expect(sortTitles([noDue, late, early])).toEqual(['Early', 'Late', 'No due']);
  });

  it('breaks remaining ties by title (locale compare)', () => {
    const b = row({ title: 'Beta', dueDate: null });
    const a = row({ title: 'Alpha', dueDate: null });
    expect(sortTitles([b, a])).toEqual(['Alpha', 'Beta']);
  });

  it('applies the full active → due → title precedence together', () => {
    const rows = [
      row({ title: 'Done-A', status: 'done', dueDate: new Date('2020-01-01') }),
      row({ title: 'Active-noDue' }),
      row({ title: 'Active-due-later', status: 'in_progress', dueDate: new Date('2026-09-01') }),
      row({ title: 'Active-due-soon', status: 'blocked', dueDate: new Date('2026-02-01') }),
    ];
    expect(sortTitles(rows)).toEqual([
      'Active-due-soon',
      'Active-due-later',
      'Active-noDue',
      'Done-A',
    ]);
  });
});
