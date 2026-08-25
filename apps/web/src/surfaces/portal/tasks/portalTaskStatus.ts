/**
 * Pure helpers deriving the client-facing task status (#126, D-042). Five
 * client statuses with Overdue taking precedence over the underlying status
 * when a not-done task is past its due date. `blockedReason`/`blockedBy` are
 * never surfaced — the chip says "Blocked" with no reason.
 */

import type { TTaskStatus } from '@siapp/shared';

export type TPortalTaskStatus = 'done' | 'overdue' | 'blocked' | 'in_progress' | 'todo';

export const PORTAL_STATUS_LABELS: Record<TPortalTaskStatus, string> = {
  done: 'Done',
  overdue: 'Overdue',
  blocked: 'Blocked',
  in_progress: 'In Progress',
  todo: 'To do',
};

interface IPortalStatusInput {
  status: TTaskStatus;
  dueDate: Date | null;
}

/** True when a not-done task has a due date strictly before `now`. */
export function isPortalOverdue(task: IPortalStatusInput, now: Date): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate.getTime() < now.getTime();
}

/**
 * Five-status derivation with Overdue precedence:
 * done → Done; else past-due → Overdue; else blocked → Blocked;
 * else in_progress → In Progress; else To do.
 */
export function derivePortalStatus(task: IPortalStatusInput, now: Date): TPortalTaskStatus {
  if (task.status === 'done') {
    return 'done';
  }
  if (isPortalOverdue(task, now)) {
    return 'overdue';
  }
  if (task.status === 'blocked') {
    return 'blocked';
  }
  if (task.status === 'in_progress') {
    return 'in_progress';
  }
  return 'todo';
}
