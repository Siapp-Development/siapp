/**
 * Collaborator activity stamping (#16, decision 6). When a task transitions
 * to `done`, each collaborator assignee's doc gets `lastTaskAt = now`
 * (Admin SDK — the field is client-immutable). The A7 list derives
 * Active/Idle from it against COLLABORATOR_ACTIVE_WINDOW_DAYS.
 *
 * The transition detection is pure so it unit-tests without emulators.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/**
 * Collaborator assignee ids to stamp for a task write: non-empty only when
 * the task exists after the write and its status transitioned to `done`
 * (idempotent — a rewrite of an already-done task stamps nothing).
 */
export function collaboratorIdsToStamp(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): string[] {
  if (after === undefined || after['status'] !== 'done' || before?.['status'] === 'done') {
    return [];
  }
  const assignees = after['assignees'];
  if (!Array.isArray(assignees)) {
    return [];
  }
  const ids = new Set<string>();
  for (const entry of assignees) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>)['type'] === 'collaborator' &&
      typeof (entry as Record<string, unknown>)['id'] === 'string'
    ) {
      ids.add((entry as Record<string, unknown>)['id'] as string);
    }
  }
  return [...ids];
}

/** Stamps `lastTaskAt` on each collaborator doc, tolerating missing docs. */
export async function stampCollaboratorLastTask(
  workspaceId: string,
  collaboratorIds: readonly string[],
): Promise<void> {
  const db = getFirestore();
  await Promise.all(
    collaboratorIds.map(async (id) => {
      const ref = db.doc(`workspaces/${workspaceId}/collaborators/${id}`);
      try {
        // update() fails on missing docs, so no pre-read is needed — just
        // suppress not-found (a stale assignee ref is not an error here).
        await ref.update({ lastTaskAt: FieldValue.serverTimestamp() });
      } catch (err) {
        if ((err as { code?: number }).code !== 5 /* NOT_FOUND */) {
          throw err;
        }
      }
    }),
  );
}
