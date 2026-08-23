/**
 * "Portfolio at a glance" derivation for the #102 Home stat strip. Pure over
 * data already fetched by useProjects + useDashboardTasks — no new queries.
 * "Active projects" and "on-track %" are workspace-wide (from project rows);
 * "overdue" and "due this week" are the signed-in member's task-bucket counts
 * (D-039 #102 §Risks/Q4), so they match the KPI tab totals exactly.
 */

import type { IProjectRow } from '../projects/useProjects.ts';
import type { ITaskBuckets } from './dueBuckets.ts';
import { projectHealth } from './projectHealth.ts';

export interface IPortfolioStats {
  activeProjects: number;
  /** Share (0–100) of active projects that are on-track; null when none active. */
  onTrackPct: number | null;
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
  const onTrackCount = active.filter((row) => projectHealth(row) === 'on_track').length;

  return {
    activeProjects: active.length,
    onTrackPct:
      active.length === 0 ? null : Math.round((onTrackCount / active.length) * 100),
    overdueTasks: buckets.overdue.length,
    dueThisWeek: buckets.dueThisWeek.length,
  };
}
