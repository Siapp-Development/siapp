/**
 * Shared status-bucket classification for the Insights surface (issue #164).
 *
 * A single source of truth for "which friendly bucket does this project fall
 * into" so the portfolio snapshot cards and the status donut can never disagree
 * (the previous Completed-count parity bug came from two divergent predicates).
 *
 * Pure and dependency-free — classifies over already-loaded `useProjects` rows,
 * no new Firestore reads/fields/rules/indexes.
 *
 * Precedence matters: a project is Completed when EITHER its lifecycle or its
 * status says so, and that wins over the plain status bucket (so a
 * lifecycle-completed/status-active project is Completed everywhere, not
 * "In progress"). `archived` (and any lifecycle the page hasn't already
 * filtered out) resolves to `null` and is excluded from the vocabulary.
 */

import type { IProjectRow } from '../projects/useProjects.ts';

export type TStatusBucketKey = 'upcoming' | 'in_progress' | 'on_hold' | 'completed';

/**
 * Classify a project into a single friendly status bucket, or `null` when it is
 * not represented in the Insights vocabulary (e.g. `archived`).
 *
 * `completed` (lifecycle OR status) takes precedence over the status bucket.
 */
export function deriveStatusBucket(
  project: Pick<IProjectRow, 'lifecycle' | 'status'>,
): TStatusBucketKey | null {
  if (project.lifecycle === 'completed' || project.status === 'completed') {
    return 'completed';
  }

  switch (project.status) {
    case 'planning':
      return 'upcoming';
    case 'active':
      return 'in_progress';
    case 'on_hold':
      return 'on_hold';
    default:
      // `archived` (and any other unexpected status) is intentionally excluded.
      return null;
  }
}
