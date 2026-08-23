import { TASK_NOTIFY_DEFAULTS } from '@siapp/shared';
import { describe, expect, it } from 'vitest';

import type { IProjectRow } from '../projects/useProjects.ts';
import type { ITaskBuckets } from './dueBuckets.ts';
import { portfolioStats } from './portfolioStats.ts';
import type { IDashboardTaskRow } from './useDashboardTasks.ts';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Project',
    code: '',
    vertical: 'construction',
    lifecycle: 'published',
    status: 'active',
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: '',
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

function taskRow(id: string): IDashboardTaskRow {
  return {
    restricted: false,
    id,
    title: 'Task',
    description: '',
    phaseId: null,
    status: 'todo',
    startDate: null,
    dueDate: null,
    completedAt: null,
    assignees: [],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: { ...TASK_NOTIFY_DEFAULTS },
    collaboratorCanSeeAllAttachments: true,
    order: 0,
    createdBy: 'u1',
    blockedReason: '',
    blockedBy: null,
    projectId: 'p1',
    projectName: 'Project',
  };
}

/** Buckets whose only relevant property here is the length of each array. */
function buckets(overrideCount: number, dueThisWeekCount: number): ITaskBuckets {
  const rows = (prefix: string, n: number): IDashboardTaskRow[] =>
    Array.from({ length: n }, (_, i) => taskRow(`${prefix}-${i}`));
  return {
    myOpen: [],
    overdue: rows('over', overrideCount),
    dueThisWeek: rows('week', dueThisWeekCount),
  };
}

describe('portfolioStats', () => {
  it('counts only draft and published projects as active (excludes archived/completed)', () => {
    const projects = [
      projectRow({ id: 'a', lifecycle: 'draft' }),
      projectRow({ id: 'b', lifecycle: 'published' }),
      projectRow({ id: 'c', lifecycle: 'archived' }),
      projectRow({ id: 'd', lifecycle: 'completed' }),
      projectRow({ id: 'e', lifecycle: 'deleted' }),
    ];
    expect(portfolioStats(projects, buckets(0, 0)).activeProjects).toBe(2);
  });

  it('returns zero active projects when none are in the working lifecycle', () => {
    const projects = [projectRow({ lifecycle: 'archived' })];
    const stats = portfolioStats(projects, buckets(0, 0));
    expect(stats.activeProjects).toBe(0);
  });

  it('passes overdue and due-this-week counts straight through from the buckets', () => {
    const stats = portfolioStats([projectRow()], buckets(3, 5));
    expect(stats.overdueTasks).toBe(3);
    expect(stats.dueThisWeek).toBe(5);
  });
});
