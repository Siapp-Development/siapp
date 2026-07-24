import { describe, expect, it } from 'vitest';

import type { IProjectRow } from '../projects/useProjects.ts';
import { attentionRank, needsAttention, projectHealth } from './projectHealth.ts';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Bungalow build',
    code: '',
    vertical: 'construction',
    lifecycle: 'published',
    status: 'active',
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: 'Alice Tan',
    startDate: null,
    targetEndDate: null,
    progressPct: 0,
    totalTasks: 0,
    doneTasks: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: false,
    collaboratorsCount: 0,
    ...overrides,
  };
}

describe('projectHealth', () => {
  it('reports on_track when nothing is overdue or blocked', () => {
    expect(projectHealth(projectRow())).toBe('on_track');
  });

  it('reports blocked when only blocked tasks exist', () => {
    expect(projectHealth(projectRow({ blockedTasks: 2 }))).toBe('blocked');
  });

  it('gives overdue precedence over blocked', () => {
    expect(projectHealth(projectRow({ overdueTasks: 1, blockedTasks: 3 }))).toBe('overdue');
  });
});

describe('needsAttention', () => {
  it('excludes a healthy published project', () => {
    expect(needsAttention(projectRow({ totalTasks: 5, doneTasks: 2 }))).toBe(false);
  });

  it('includes unhealthy projects', () => {
    expect(needsAttention(projectRow({ overdueTasks: 1 }))).toBe(true);
    expect(needsAttention(projectRow({ blockedTasks: 1 }))).toBe(true);
  });

  it('includes a draft with tasks but not an empty draft', () => {
    expect(needsAttention(projectRow({ lifecycle: 'draft', totalTasks: 3 }))).toBe(true);
    expect(needsAttention(projectRow({ lifecycle: 'draft', totalTasks: 0 }))).toBe(false);
  });
});

describe('attentionRank', () => {
  it('orders overdue before blocked before draft', () => {
    const overdue = projectRow({ overdueTasks: 1 });
    const blocked = projectRow({ blockedTasks: 1 });
    const draft = projectRow({ lifecycle: 'draft', totalTasks: 3 });
    expect(attentionRank(overdue)).toBeLessThan(attentionRank(blocked));
    expect(attentionRank(blocked)).toBeLessThan(attentionRank(draft));
  });
});
