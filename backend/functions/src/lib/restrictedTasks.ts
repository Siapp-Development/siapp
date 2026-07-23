/**
 * Pure department need-to-know helpers for the getRestrictedTaskHeaders
 * callable (#13) — no Admin SDK imports so it unit-tests without emulators
 * (same convention as projectLifecycle.ts).
 *
 * Visibility semantics mirror `canSeeRestricted` in firestore.rules:
 * owner/admin always see everything; empty/missing restriction list is
 * unrestricted; otherwise the member needs at least one matching department.
 */

export type TMemberRole = 'owner' | 'admin' | 'pm' | 'viewer';

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export type TTaskStatus = (typeof TASK_STATUSES)[number];

/** Mirrors IRestrictedTaskHeader in @siapp/shared (source-only package). */
export interface IRestrictedTaskHeader {
  id: string;
  title: string;
  status: TTaskStatus;
  phaseId: string | null;
  /** ISO string (callable responses cannot carry Timestamps). */
  dueDate: string | null;
  order: number;
  restrictedToDepartments: string[];
}

export function canSeeRestrictedTask(
  role: TMemberRole,
  memberDepartments: readonly string[],
  restrictedToDepartments: readonly string[],
): boolean {
  if (role === 'owner' || role === 'admin') {
    return true;
  }
  if (restrictedToDepartments.length === 0) {
    return true;
  }
  return restrictedToDepartments.some((dep) => memberDepartments.includes(dep));
}

/**
 * Safe projection of a task doc the caller cannot read: enough to render the
 * list row + "Restricted" badge, nothing more (no description, assignees,
 * activity, or toggles).
 */
export function toRestrictedHeader(id: string, data: Record<string, unknown>): IRestrictedTaskHeader {
  const status = data['status'];
  const dueDate = data['dueDate'] as { toDate?: () => Date } | undefined;
  const restrictions = data['restrictedToDepartments'];
  return {
    id,
    title: typeof data['title'] === 'string' ? data['title'] : '',
    status: (TASK_STATUSES as readonly string[]).includes(status as string)
      ? (status as TTaskStatus)
      : 'todo',
    phaseId: typeof data['phaseId'] === 'string' ? data['phaseId'] : null,
    dueDate: typeof dueDate?.toDate === 'function' ? dueDate.toDate().toISOString() : null,
    order: typeof data['order'] === 'number' ? data['order'] : 0,
    restrictedToDepartments: Array.isArray(restrictions)
      ? restrictions.filter((dep): dep is string => typeof dep === 'string')
      : [],
  };
}

/** Reads restriction list off a raw task doc, tolerating missing field. */
export function restrictionsOf(data: Record<string, unknown>): string[] {
  const value = data['restrictedToDepartments'];
  return Array.isArray(value) ? value.filter((dep): dep is string => typeof dep === 'string') : [];
}
