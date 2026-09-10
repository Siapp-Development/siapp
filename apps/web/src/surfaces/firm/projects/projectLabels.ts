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

/**
 * Compact client-column label (#157, D10): the first client's name plus a
 * "＋N" overflow marker for the rest — never the full list, never a bare count.
 * Returns '' when no clients are linked so callers can render their own empty
 * state ("No client linked").
 */
export function clientSummaryLabel(clients: readonly { name: string }[]): string {
  if (clients.length === 0) {
    return '';
  }
  const [first, ...rest] = clients;
  const firstName = first?.name ?? '';
  return rest.length === 0 ? firstName : `${firstName} ＋${rest.length}`;
}
