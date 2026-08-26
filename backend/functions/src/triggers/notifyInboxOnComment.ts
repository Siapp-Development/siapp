/**
 * In-app notification fan-out for task comments (#134).
 *
 * Fires on `.../tasks/{taskId}/updates/{updateId}` creates and acts only on
 * `action === 'comment'` docs. Comments (with `payload.mentions`) are written
 * to the task `updates` subcollection — NOT mirrored into the project
 * `activity` feed (`TProjectActivityAction` has no `comment` action), so this
 * is the single source for mention/watcher notifications (Risk #1 resolved).
 *
 * Recipients:
 *   - mentions  → `payload.mentions` (kind `mention`, highest priority)
 *   - watchers  → task assignees ∪ prior distinct user commenters (kind
 *                 `task_comment`)
 * `resolveRecipients` dedupes with mention-priority, so a mentioned assignee
 * gets exactly one `mention` row. Each recipient's `nid = updateId` keeps
 * at-least-once delivery idempotent. The comment author and non-members are
 * excluded; department gating (D-025) is applied.
 */

import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';

import { errorPayload } from '../lib/errors.js';
import {
  buildNotification,
  createNotification,
  loadMemberIndex,
  resolveRecipients,
  trimNotifications,
  userAssigneeUids,
  type INotificationDenorm,
  type TActorType,
} from '../lib/notificationFanout.js';

type TCommentEvent = FirestoreEvent<
  QueryDocumentSnapshot | undefined,
  { workspaceId: string; projectId: string; taskId: string; updateId: string }
>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function notifyInboxOnComment(event: TCommentEvent): Promise<void> {
  const data = event.data?.data();
  if (data === undefined || data['action'] !== 'comment') {
    return;
  }
  const { workspaceId, projectId, taskId, updateId } = event.params;

  try {
    const db = getFirestore();
    const authorType = asString(data['authorType']);
    const authorId = asString(data['authorId']);
    // Only firm-member authors are candidate actors to exclude; collaborator
    // and client comment authors are never members.
    const actorId = authorType === 'user' ? authorId : '';
    const payload =
      typeof data['payload'] === 'object' && data['payload'] !== null
        ? (data['payload'] as Record<string, unknown>)
        : {};
    const mentionedUids = asStringArray(payload['mentions']);

    const taskSnap = await db
      .doc(`workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`)
      .get();
    if (!taskSnap.exists) {
      return;
    }
    const taskAssigneeUids = userAssigneeUids(taskSnap.get('assignees'));
    const restrictedToDepartments = asStringArray(taskSnap.get('restrictedToDepartments'));
    const taskTitle = asString(taskSnap.get('title'));

    // Prior distinct user commenters (watchers) — includes this update, but
    // the author is excluded via actorId below.
    const updatesSnap = await db
      .collection(`workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/updates`)
      .where('authorType', '==', 'user')
      .get();
    const priorCommenters = new Set<string>();
    for (const doc of updatesSnap.docs) {
      const uid = doc.get('authorId');
      if (typeof uid === 'string' && uid !== '') {
        priorCommenters.add(uid);
      }
    }

    const memberIndex = await loadMemberIndex(db, workspaceId, [
      ...mentionedUids,
      ...taskAssigneeUids,
      ...priorCommenters,
    ]);

    const recipients = resolveRecipients({
      kind: 'task_comment',
      actorId,
      restrictedToDepartments,
      memberIndex,
      taskAssigneeUids,
      priorCommenterUids: [...priorCommenters],
      mentionedUids,
    });

    if (recipients.length === 0) {
      return;
    }

    const projectSnap = await db.doc(`workspaces/${workspaceId}/projects/${projectId}`).get();
    const denorm: INotificationDenorm = {
      actorType: (authorType as TActorType) || 'user',
      actorId,
      actorNameDenorm: asString(data['authorNameDenorm']),
      projectId,
      projectNameDenorm: asString(projectSnap.get('name')),
      taskId,
      taskTitleDenorm: taskTitle || null,
      excerpt: typeof payload['text'] === 'string' && payload['text'] !== '' ? payload['text'] : null,
      sourceActivityId: updateId,
    };

    for (const recipient of recipients) {
      try {
        await createNotification(
          db,
          workspaceId,
          recipient.uid,
          updateId,
          buildNotification(recipient.kind, denorm),
        );
        await trimNotifications(db, workspaceId, recipient.uid);
      } catch (error) {
        logger.error('notifyInboxOnComment: recipient write failed', {
          workspaceId,
          projectId,
          taskId,
          updateId,
          recipientUid: recipient.uid,
          err: errorPayload(error),
        });
      }
    }
  } catch (error) {
    logger.error('notifyInboxOnComment: fan-out failed', {
      workspaceId,
      projectId,
      taskId,
      updateId,
      err: errorPayload(error),
    });
  }
}
