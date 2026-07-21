import type { TProjectLifecycle } from '@siapp/shared';

import { LIFECYCLE_LABELS } from './projectLabels.ts';

const LIFECYCLE_BADGE_CLASSES: Record<TProjectLifecycle, string> = {
  draft: 'bg-muted text-foreground',
  published: 'bg-primary/10 text-primary',
  completed: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-amber-100 text-amber-800',
  deleted: 'bg-destructive/10 text-destructive',
};

export function LifecycleBadge({ lifecycle }: { lifecycle: TProjectLifecycle }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${LIFECYCLE_BADGE_CLASSES[lifecycle]}`}
    >
      {LIFECYCLE_LABELS[lifecycle]}
    </span>
  );
}
