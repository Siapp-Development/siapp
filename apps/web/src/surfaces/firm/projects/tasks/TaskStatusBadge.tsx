import { Badge } from '@siapp/ui';
import type { TTaskStatus } from '@siapp/shared';

import { TASK_STATUS_LABELS } from './taskLabels.ts';

const STATUS_VARIANTS: Record<TTaskStatus, 'neutral' | 'primary' | 'warning' | 'success'> = {
  todo: 'neutral',
  in_progress: 'primary',
  blocked: 'warning',
  done: 'success',
};

/** Colored task status chip — color always paired with the label text. */
export function TaskStatusBadge({ status }: { status: TTaskStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{TASK_STATUS_LABELS[status]}</Badge>;
}
