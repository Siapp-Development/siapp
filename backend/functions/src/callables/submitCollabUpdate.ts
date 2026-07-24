/**
 * submitCollabUpdate (#22, D-b): the single collaborator write path for
 * status changes, need-help (D-d), and notes. Requires collab claims minted
 * by redeemCollabLink; re-checks lifecycle + assignment server-side on every
 * call (soft revocation posture, Q1).
 *
 * Task writes go through the Admin SDK with `updatedBy` stamped to the
 * collab principal uid (`collab_{wid}_{tid}_{colid}`) so the EXISTING
 * onTaskWrite trigger derives collaborator-attributed activity and enqueues
 * notifications (done → client WA per D-032; blocked → task_blocked internal
 * WA per #18). Notes and need-help are additionally mirrored into the
 * project Activity timeline as collaborator_* entries (Q2) — the trigger
 * cannot see either (notes touch no task field; the need-help reason is
 * not part of the status diff).
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { collabUid } from '../lib/portalTokens.js';
import { writeProjectActivity } from '../lib/activityLog.js';
import {
  isCollaboratorAssignee,
  passesCollabVisibility,
} from './issueCollabLink.js';

export const COLLAB_REASON_MAX = 1000;
export const COLLAB_NOTE_MAX = 5000;

export type TCollabUpdate =
  | { kind: 'status'; to: 'in_progress' | 'done' }
  | { kind: 'need_help'; reason: string }
  | { kind: 'note'; text: string };

/**
 * Validates the discriminated payload — null when malformed (empty/oversized
 * text, unknown kind, bad status target). Pure so it unit-tests without
 * emulators.
 */
export function parseCollabUpdate(raw: unknown): TCollabUpdate | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const update = raw as Record<string, unknown>;
  if (update['kind'] === 'status') {
    return update['to'] === 'in_progress' || update['to'] === 'done'
      ? { kind: 'status', to: update['to'] }
      : null;
  }
  if (update['kind'] === 'need_help') {
    const reason = typeof update['reason'] === 'string' ? update['reason'].trim() : '';
    return reason.length >= 1 && reason.length <= COLLAB_REASON_MAX
      ? { kind: 'need_help', reason }
      : null;
  }
  if (update['kind'] === 'note') {
    const text = typeof update['text'] === 'string' ? update['text'].trim() : '';
    return text.length >= 1 && text.length <= COLLAB_NOTE_MAX ? { kind: 'note', text } : null;
  }
  return null;
}

interface ICollabClaims {
  wid: string;
  tid: string;
  pid: string;
  colid: string;
}

/** Collab claims off a callable auth token, or null when absent/malformed. */
export function collabClaimsOf(token: Record<string, unknown> | undefined): ICollabClaims | null {
  const collab = token?.['collab'] as Record<string, unknown> | undefined;
  if (typeof collab !== 'object' || collab === null) {
    return null;
  }
  const { wid, pid, tid, colid } = collab as {
    wid?: unknown;
    pid?: unknown;
    tid?: unknown;
    colid?: unknown;
  };
  if (
    typeof wid !== 'string' ||
    typeof pid !== 'string' ||
    typeof tid !== 'string' ||
    typeof colid !== 'string' ||
    wid === '' ||
    pid === '' ||
    tid === '' ||
    colid === ''
  ) {
    return null;
  }
  return { wid, pid, tid, colid };
}

export const submitCollabUpdate = onCall(async (request) => {
  const claims = collabClaimsOf(request.auth?.token as Record<string, unknown> | undefined);
  if (claims === null) {
    throw new HttpsError('permission-denied', 'This action needs a task link session.');
  }
  const update = parseCollabUpdate((request.data as Record<string, unknown> | undefined)?.['update']);
  if (update === null) {
    throw new HttpsError('invalid-argument', 'Invalid update payload.');
  }

  const { wid, pid, tid, colid } = claims;
  const db = getFirestore();
  const taskRef = db.doc(`workspaces/${wid}/projects/${pid}/tasks/${tid}`);
  const [projectSnap, taskSnap, collaboratorSnap] = await Promise.all([
    db.doc(`workspaces/${wid}/projects/${pid}`).get(),
    taskRef.get(),
    db.doc(`workspaces/${wid}/collaborators/${colid}`).get(),
  ]);

  // Same re-checks the rules make on reads: lifecycle gate (D-027) plus
  // assignment + visibility — unassignment instantly closes the write path.
  const lifecycle = projectSnap.get('lifecycle');
  if (
    !projectSnap.exists ||
    !taskSnap.exists ||
    (lifecycle !== 'published' && lifecycle !== 'completed') ||
    !isCollaboratorAssignee(taskSnap.get('assignees'), colid) ||
    !passesCollabVisibility(taskSnap.get('visibleToCollaboratorIds'), colid)
  ) {
    throw new HttpsError('permission-denied', 'This task is no longer available.');
  }

  const actorUid = collabUid(wid, tid, colid);
  const collaboratorName =
    typeof collaboratorSnap.get('name') === 'string' && collaboratorSnap.get('name') !== ''
      ? (collaboratorSnap.get('name') as string)
      : 'A collaborator';
  const fromStatus = typeof taskSnap.get('status') === 'string' ? taskSnap.get('status') : 'todo';
  const restrictions = Array.isArray(taskSnap.get('restrictedToDepartments'))
    ? (taskSnap.get('restrictedToDepartments') as unknown[]).filter(
        (d): d is string => typeof d === 'string',
      )
    : [];
  const taskTitle = typeof taskSnap.get('title') === 'string' ? taskSnap.get('title') : '';

  const updatesRef = taskRef.collection('updates').doc();
  const updateEntryBase = {
    id: updatesRef.id,
    authorType: 'collaborator',
    authorId: colid,
    authorNameDenorm: collaboratorName,
    source: 'web',
    createdAt: FieldValue.serverTimestamp(),
  };

  if (update.kind === 'status') {
    await taskRef.update({
      status: update.to,
      ...(update.to === 'done'
        ? { completedAt: FieldValue.serverTimestamp() }
        : { completedAt: FieldValue.delete() }),
      // D-d: leaving 'blocked' clears the reason.
      ...(fromStatus === 'blocked' ? { blockedReason: FieldValue.delete() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
    });
    await updatesRef.set({
      ...updateEntryBase,
      action: 'status_change',
      payload: { from: fromStatus, to: update.to },
    });
    return { ok: true };
  }

  if (update.kind === 'need_help') {
    await taskRef.update({
      status: 'blocked',
      blockedReason: update.reason,
      completedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
    });
    await updatesRef.set({
      ...updateEntryBase,
      action: 'status_change',
      payload: { from: fromStatus, to: 'blocked', text: update.reason },
    });
    // Q2 mirror — the reason itself never surfaces via the status diff.
    await writeProjectActivity(wid, pid, {
      action: 'collaborator_need_help',
      actorType: 'collaborator',
      actorId: colid,
      actorNameDenorm: collaboratorName,
      taskId: tid,
      taskTitleDenorm: taskTitle,
      restrictedToDepartments: restrictions,
      visibleToClient: false,
      payload: { to: update.reason },
    });
    return { ok: true };
  }

  await updatesRef.set({
    ...updateEntryBase,
    action: 'comment',
    payload: { text: update.text },
  });
  // Q2 mirror — notes touch no task field, so the trigger never sees them.
  await writeProjectActivity(wid, pid, {
    action: 'collaborator_note_added',
    actorType: 'collaborator',
    actorId: colid,
    actorNameDenorm: collaboratorName,
    taskId: tid,
    taskTitleDenorm: taskTitle,
    restrictedToDepartments: restrictions,
    visibleToClient: false,
    payload: {},
  });
  return { ok: true };
});
