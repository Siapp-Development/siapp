import type { TTaskStatus } from '@siapp/shared';

export const TASK_STATUS_LABELS: Record<TTaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};
