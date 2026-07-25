import { Badge } from '@siapp/ui';
import type { TProjectLifecycle } from '@siapp/shared';

import { LIFECYCLE_LABELS } from './projectLabels.ts';

const LIFECYCLE_VARIANTS: Record<
  TProjectLifecycle,
  'neutral' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  draft: 'neutral',
  published: 'primary',
  completed: 'success',
  archived: 'warning',
  deleted: 'danger',
};

export function LifecycleBadge({ lifecycle }: { lifecycle: TProjectLifecycle }) {
  return <Badge variant={LIFECYCLE_VARIANTS[lifecycle]}>{LIFECYCLE_LABELS[lifecycle]}</Badge>;
}
