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
 * Per-invocation `users/{uid}` displayName resolver (D4). Memoized so a
 * multi-event write reads each profile once; missing/unnamed profiles fall
 * back to 'Unknown member'.
 */
export function createActorNameResolver(): (uid: string | null) => Promise<string> {
  const cache = new Map<string, Promise<string>>();
  return (uid) => {
    if (uid === null || uid === '') {
      return Promise.resolve('Unknown member');
    }
    let pending = cache.get(uid);
    if (pending === undefined) {
      pending = getFirestore()
        .doc(`users/${uid}`)
        .get()
        .then((snap) => {
          const name = snap.get('displayName') as unknown;
          return typeof name === 'string' && name !== '' ? name : 'Unknown member';
        })
        .catch(() => 'Unknown member');
      cache.set(uid, pending);
    }
    return pending;
  };
}
