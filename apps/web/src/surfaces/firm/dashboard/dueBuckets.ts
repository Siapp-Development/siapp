/**
 * Pure bucketing for the #17 dashboard task section. "My tasks" matching is
 * client-side over the fetched rows (D3); "due this week" is a rolling
 * 7 × 24 h window from `now` in the viewer's local timezone (D6). Buckets are
 * mutually exclusive: overdue < now ≤ due this week < now + 7d ≤ the rest
 * (no due date or due later) under `myOpen`.
 */

import type { IDashboardTaskRow } from './useDashboardTasks.ts';

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface ITaskBuckets {
  /** My open tasks that are neither overdue nor due within 7 days. */
  myOpen: IDashboardTaskRow[];
  overdue: IDashboardTaskRow[];
  dueThisWeek: IDashboardTaskRow[];
}

/** Due date ascending, nulls last, then board order for a stable tiebreak. */
function byDueDate(a: IDashboardTaskRow, b: IDashboardTaskRow): number {
  if (a.dueDate !== null && b.dueDate !== null && a.dueDate.getTime() !== b.dueDate.getTime()) {
    return a.dueDate.getTime() - b.dueDate.getTime();
  }
  if ((a.dueDate === null) !== (b.dueDate === null)) {
    return a.dueDate === null ? 1 : -1;
  }
  return a.order - b.order || a.id.localeCompare(b.id);
}

export function bucketTasks(
  rows: readonly IDashboardTaskRow[],
  uid: string,
  now: Date,
): ITaskBuckets {
  const nowMs = now.getTime();
  const myOpen: IDashboardTaskRow[] = [];
  const overdue: IDashboardTaskRow[] = [];
  const dueThisWeek: IDashboardTaskRow[] = [];

  for (const row of rows) {
    if (row.status === 'done') {
      continue;
    }
    const isMine = row.assignees.some((a) => a.type === 'user' && a.id === uid);
    if (!isMine) {
      continue;
    }
    const dueMs = row.dueDate?.getTime();
    if (dueMs !== undefined && dueMs < nowMs) {
      overdue.push(row);
    } else if (dueMs !== undefined && dueMs < nowMs + WEEK_MS) {
      dueThisWeek.push(row);
    } else {
      myOpen.push(row);
    }
  }

  myOpen.sort(byDueDate);
  overdue.sort(byDueDate);
  dueThisWeek.sort(byDueDate);
  return { myOpen, overdue, dueThisWeek };
}
