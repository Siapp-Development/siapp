/**
 * Pure D-027 project-lifecycle state machine — no Admin SDK imports so it
 * unit-tests without emulators (same convention as invites.ts).
 *
 * Transition + role matrix source of truth:
 * pm_ux/plans/firestore-data-model.md §"Project lifecycle & notification gate".
 */

export const PROJECT_LIFECYCLES = [
  'draft',
  'published',
  'completed',
  'archived',
  'deleted',
] as const;
export type TProjectLifecycle = (typeof PROJECT_LIFECYCLES)[number];

export const LIFECYCLE_ACTIONS = ['publish', 'complete', 'archive', 'reopen', 'delete'] as const;
export type TProjectLifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export type TMemberRole = 'owner' | 'admin' | 'pm' | 'viewer';

/** Stable error codes surfaced to the web app (mirrors TProjectErrorCode). */
export type TProjectErrorCode =
  | 'project/not-found'
  | 'project/invalid-transition'
  | 'project/forbidden-transition';

export function isLifecycleAction(value: unknown): value is TProjectLifecycleAction {
  return typeof value === 'string' && (LIFECYCLE_ACTIONS as readonly string[]).includes(value);
}

interface ITransitionRule {
  from: readonly TProjectLifecycle[];
  to: TProjectLifecycle;
  roles: readonly TMemberRole[];
}

const TRANSITIONS: Record<TProjectLifecycleAction, readonly ITransitionRule[]> = {
  publish: [{ from: ['draft'], to: 'published', roles: ['owner', 'admin', 'pm'] }],
  complete: [{ from: ['published'], to: 'completed', roles: ['owner', 'admin', 'pm'] }],
  archive: [
    // PMs cannot archive a live project (D-027).
    { from: ['published'], to: 'archived', roles: ['owner', 'admin'] },
    { from: ['completed'], to: 'archived', roles: ['owner', 'admin', 'pm'] },
  ],
  reopen: [{ from: ['completed'], to: 'published', roles: ['owner', 'admin'] }],
  delete: [
    {
      from: ['draft', 'published', 'completed', 'archived'],
      to: 'deleted',
      roles: ['owner'],
    },
  ],
};

/** Timestamp field stamped alongside each resulting lifecycle state. */
export const LIFECYCLE_TIMESTAMP_FIELD: Record<
  Exclude<TProjectLifecycle, 'draft'>,
  'publishedAt' | 'completedAt' | 'archivedAt' | 'deletedAt'
> = {
  published: 'publishedAt',
  completed: 'completedAt',
  archived: 'archivedAt',
  deleted: 'deletedAt',
};

export type TTransitionResult =
  | { ok: true; to: TProjectLifecycle }
  | { ok: false; code: 'project/invalid-transition' | 'project/forbidden-transition' };

/**
 * Validates `action` against the current lifecycle and the caller's role.
 * Invalid state beats insufficient role: a viewer asking to publish a
 * published project gets invalid-transition, not forbidden.
 */
export function checkTransition(
  current: TProjectLifecycle,
  action: TProjectLifecycleAction,
  role: TMemberRole,
): TTransitionResult {
  const rule = TRANSITIONS[action].find((r) => r.from.includes(current));
  if (rule === undefined) {
    return { ok: false, code: 'project/invalid-transition' };
  }
  if (!rule.roles.includes(role)) {
    return { ok: false, code: 'project/forbidden-transition' };
  }
  return { ok: true, to: rule.to };
}
