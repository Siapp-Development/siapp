/**
 * "Portfolio at a glance" derivation for the #102 Home stat strip. Pure over
 * data already fetched by useProjects + useDashboardTasks — no new queries.
 * "Active projects" is workspace-wide (from project rows); "overdue" and "due
 * this week" are the signed-in member's task-bucket counts
 * (D-039 #102 §Risks/Q4), so they match the KPI tab totals exactly.
 */

import type { IProjectRow } from '../projects/useProjects.ts';
import type { ITaskBuckets } from './dueBuckets.ts';

export interface IPortfolioStats {
  activeProjects: number;
  overdueTasks: number;
  dueThisWeek: number;
}

/** Active = in the working lifecycle (draft or published), matching attention scope. */
function isActive(row: IProjectRow): boolean {
  return row.lifecycle === 'draft' || row.lifecycle === 'published';
}

export function portfolioStats(
  projects: readonly IProjectRow[],
  buckets: ITaskBuckets,
): IPortfolioStats {
  const active = projects.filter(isActive);

  return {
    activeProjects: active.length,
    overdueTasks: buckets.overdue.length,
    dueThisWeek: buckets.dueThisWeek.length,
  };
}
