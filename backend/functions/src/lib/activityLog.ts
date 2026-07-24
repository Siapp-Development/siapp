/**
 * Project activity writer (#23, D1/D3/D4). All writes use the Admin SDK —
 * firestore.rules denies every client write on `activity`.
 *
 * Trigger-sourced entries pass a deterministic id (derived from the trigger
 * `event.id`) and are written with `create()` so Firestore's at-least-once
 * delivery cannot double-write. Callable-sourced entries pass their own
 * deterministic id where dedupe with a trigger fallback matters
 * (task_deleted, Q5) or omit it for an auto id.
 *
 * The writer never throws into callers — activity capture must not break
 * summary/claims/notification maintenance (same posture as the #18 enqueue).
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import type { TActorType, TProjectActivityAction } from './activityDiff.js';

export interface IActivityEntry {
  action: TProjectActivityAction;
  actorType: TActorType;
  actorId: string;
  actorNameDenorm: string;
  taskId?: string;
  taskTitleDenorm?: string;
  docId?: string;
  docNameDenorm?: string;
  restrictedToDepartments: string[];
  /** #21 (D4): denormalized portal visibility — client-safe actions only. */
  visibleToClient: boolean;
  payload: { from?: unknown; to?: unknown };
  wouldHaveNotified?: boolean;
}

/**
 * Writes one activity entry under the project. Returns true when written,
 * false on a dedupe hit (deterministic id already exists) or write failure.
 */
export async function writeProjectActivity(
  workspaceId: string,
  projectId: string,
  entry: IActivityEntry,
  deterministicId?: string,
): Promise<boolean> {
  const collection = getFirestore().collection(
    `workspaces/${workspaceId}/projects/${projectId}/activity`,
  );
  const ref = deterministicId !== undefined ? collection.doc(deterministicId) : collection.doc();
  try {
    await ref.create({
      ...entry,
      id: ref.id,
      at: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    // ALREADY_EXISTS (gRPC code 6) = idempotency doing its job.
    if ((error as { code?: number }).code === 6) {
      logger.debug('writeProjectActivity: dedupe hit', { id: ref.id });
    } else {
      logger.error('writeProjectActivity: write failed', {
        workspaceId,
        projectId,
        action: entry.action,
        error,
      });
    }
    return false;
  }
}

/**
 * Deterministic activity doc id for a task hard-delete (Q5): the deleteTask
 * callable writes the attributed entry first; the onTaskWrite fallback uses
 * the same id, so its `create()` silently no-ops when the callable already
 * recorded the event. Task ids are auto-generated and never reused.
 */
export function taskDeletedActivityId(taskId: string): string {
  return `task_deleted_${taskId}`;
}

/**
 * Per-invocation actor displayName resolver (D4). Memoized so a multi-event
 * write reads each profile once; missing/unnamed profiles fall back to
 * 'Unknown member'. #22: collaborator actors (actorType 'collaborator',
 * actorId = colid) resolve via `workspaces/{wid}/collaborators/{colid}`
 * instead of `users/{uid}` — pass the workspaceId to enable it; fallback is
 * 'A collaborator'.
 */
export function createActorNameResolver(
  workspaceId?: string,
): (uid: string | null, actorType?: TActorType) => Promise<string> {
  const cache = new Map<string, Promise<string>>();
  return (uid, actorType) => {
    const collaborator = actorType === 'collaborator' && workspaceId !== undefined;
    const fallback = collaborator ? 'A collaborator' : 'Unknown member';
    if (uid === null || uid === '') {
      return Promise.resolve(fallback);
    }
    const path = collaborator ? `workspaces/${workspaceId}/collaborators/${uid}` : `users/${uid}`;
    let pending = cache.get(path);
    if (pending === undefined) {
      pending = getFirestore()
        .doc(path)
        .get()
        .then((snap) => {
          const name = snap.get(collaborator ? 'name' : 'displayName') as unknown;
          return typeof name === 'string' && name !== '' ? name : fallback;
        })
        .catch(() => fallback);
      cache.set(path, pending);
    }
    return pending;
  };
}
