import type { TProjectLifecycle, TProjectStatus, TProjectVertical } from '@siapp/shared';

export const STATUS_LABELS: Record<TProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
};

export const VERTICAL_LABELS: Record<TProjectVertical, string> = {
  construction: 'Construction',
  legal: 'Legal',
  other: 'Other',
};

export const LIFECYCLE_LABELS: Record<TProjectLifecycle, string> = {
  draft: 'Draft',
  published: 'Published',
  completed: 'Completed',
  archived: 'Archived',
  deleted: 'Deleted',
};
