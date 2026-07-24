import { describe, expect, it } from 'vitest';

import { computeSummaryCounters, type ITaskFieldReader } from './projectSummary.js';

const NOW = new Date('2026-07-20T12:00:00.000Z').getTime();

function task(fields: {
  status: string;
  dueMs?: number;
}): ITaskFieldReader {
  return {
    get(field: string): unknown {
      if (field === 'status') {
        return fields.status;
      }
      if (field === 'dueDate') {
        return fields.dueMs === undefined ? undefined : { toMillis: () => fields.dueMs };
      }
      return undefined;
    },
  };
}

describe('computeSummaryCounters', () => {
  it('returns zeroed counters for an empty collection', () => {
    expect(computeSummaryCounters([], NOW)).toEqual({
      totalTasks: 0,
      doneTasks: 0,
      overdueTasks: 0,
      blockedTasks: 0,
      progressPct: 0,
    });
  });

  it('counts done, overdue and progress as before', () => {
    const counters = computeSummaryCounters(
      [
        task({ status: 'done' }),
        task({ status: 'todo', dueMs: NOW - 1 }),
        task({ status: 'in_progress', dueMs: NOW + 1 }),
        task({ status: 'todo' }),
      ],
      NOW,
    );
    expect(counters).toEqual({
      totalTasks: 4,
      doneTasks: 1,
      overdueTasks: 1,
      blockedTasks: 0,
      progressPct: 25,
    });
  });

  it('counts blocked tasks into blockedTasks', () => {
    const counters = computeSummaryCounters(
      [task({ status: 'blocked' }), task({ status: 'blocked' }), task({ status: 'todo' })],
      NOW,
    );
    expect(counters.blockedTasks).toBe(2);
    expect(counters.overdueTasks).toBe(0);
  });

  it('counts a past-due blocked task as both blocked and overdue', () => {
    const counters = computeSummaryCounters([task({ status: 'blocked', dueMs: NOW - 1 })], NOW);
    expect(counters.blockedTasks).toBe(1);
    expect(counters.overdueTasks).toBe(1);
  });

  it('never counts done tasks as blocked or overdue', () => {
    const counters = computeSummaryCounters(
      [task({ status: 'done', dueMs: NOW - 1000 })],
      NOW,
    );
    expect(counters).toEqual({
      totalTasks: 1,
      doneTasks: 1,
      overdueTasks: 0,
      blockedTasks: 0,
      progressPct: 100,
    });
  });

  it('treats a due date exactly at now as not overdue', () => {
    const counters = computeSummaryCounters([task({ status: 'todo', dueMs: NOW })], NOW);
    expect(counters.overdueTasks).toBe(0);
  });
});
