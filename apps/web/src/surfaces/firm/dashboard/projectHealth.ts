/**
 * Project health for the #17 dashboard, derived from the server-aggregated
 * `project.summary` counters (D4). Aggregate counts include restricted tasks
 * by design — counts only, no content (D7, #12 precedent).
 */

import type { IProjectRow } from '../projects/useProjects.ts';

export type TProjectHealth = 'overdue' | 'blocked' | 'on_track';

/** Health precedence: overdue > blocked > on-track (D4). */
export function projectHealth(row: IProjectRow): TProjectHealth {
  if (row.overdueTasks > 0) {
    return 'overdue';
  }
  if (row.blockedTasks > 0) {
    return 'blocked';
  }
  return 'on_track';
}

/**
 * A0 "needs your attention" membership: unhealthy, or an unpublished draft
 * that already has tasks (D4).
 */
export function needsAttention(row: IProjectRow): boolean {
  return projectHealth(row) !== 'on_track' || (row.lifecycle === 'draft' && row.totalTasks > 0);
}

/** Worst-first ordering for the attention table: overdue > blocked > draft. */
export function attentionRank(row: IProjectRow): number {
  const health = projectHealth(row);
  if (health === 'overdue') {
    return 0;
  }
  if (health === 'blocked') {
    return 1;
  }
  return 2;
}
