/**
 * D-027 lifecycle-action gating for the projects surface, extracted so the
 * Details-tab `LifecycleActions` buttons and the header `ProjectActionsMenu`
 * share one source of truth for which transitions each role may run per
 * lifecycle, plus the shared error-message mapping.
 */

import type {
  TMemberRole,
  TProjectLifecycle,
  TProjectLifecycleAction,
} from '@siapp/shared';

import { projectErrorCode } from '@/lib/callables.ts';

export interface ILifecycleActionEntry {
  action: TProjectLifecycleAction;
  roles: TMemberRole[];
  label: string;
}

/** D-027 action availability by lifecycle and role (mirrors the callable). */
export const LIFECYCLE_ACTIONS: Record<TProjectLifecycle, ILifecycleActionEntry[]> = {
  draft: [{ action: 'delete', roles: ['owner'], label: 'Delete' }],
  published: [
    { action: 'complete', roles: ['owner', 'admin', 'pm'], label: 'Mark completed' },
    { action: 'archive', roles: ['owner', 'admin'], label: 'Archive' },
    { action: 'delete', roles: ['owner'], label: 'Delete' },
  ],
  completed: [
    { action: 'reopen', roles: ['owner', 'admin'], label: 'Reopen' },
    { action: 'archive', roles: ['owner', 'admin', 'pm'], label: 'Archive' },
    { action: 'delete', roles: ['owner'], label: 'Delete' },
  ],
  archived: [{ action: 'delete', roles: ['owner'], label: 'Delete' }],
  deleted: [],
};

/** Lifecycle actions available for a given lifecycle + role. */
export function lifecycleActionsFor(
  lifecycle: TProjectLifecycle,
  role: TMemberRole,
): ILifecycleActionEntry[] {
  return LIFECYCLE_ACTIONS[lifecycle].filter((entry) => entry.roles.includes(role));
}

/** True when `action` is permitted for the given lifecycle + role. */
export function canRunLifecycleAction(
  lifecycle: TProjectLifecycle,
  role: TMemberRole,
  action: TProjectLifecycleAction,
): boolean {
  return LIFECYCLE_ACTIONS[lifecycle].some(
    (entry) => entry.action === action && entry.roles.includes(role),
  );
}

const PROJECT_ERROR_MESSAGES: Record<string, string> = {
  'project/not-found': 'This project no longer exists.',
  'project/invalid-transition': 'This project has changed — refresh and try again.',
  'project/forbidden-transition': 'Your role cannot perform this action.',
};

export function lifecycleErrorMessage(err: unknown): string {
  const code = projectErrorCode(err);
  if (code !== null && code in PROJECT_ERROR_MESSAGES) {
    return PROJECT_ERROR_MESSAGES[code];
  }
  return err instanceof Error ? err.message : 'Could not update the project.';
}
