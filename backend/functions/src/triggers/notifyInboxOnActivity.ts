/**
 * In-app notification fan-out for project activity (#134).
 *
 * Fires on every `activity` doc create and maps the client-relevant subset of
 * activity actions to per-recipient inbox notifications:
 *   - task_assigned         → newly-assigned firm members
 *   - task_status_changed   → task watchers (assignees ∪ prior commenters)
 *   - task_blocked          → task watchers (status change into `blocked`)
 *   - collaborator_note_added / collaborator_need_help → task watchers
 *   - client_document_uploaded / project_{published,completed,archived}
 *                           → project participants (task assignees ∪ owner)
 * Everything else maps to `null` and is ignored.
 *
 * Recipients are department-gated (D-025), the actor is excluded, and each
 * recipient gets a deterministic `nid = activityId` so at-least-once delivery
 * cannot double-notify. Comment/mention notifications are handled separately
 * (`notifyInboxOnComment.ts`) — comments are written to the task `updates`
 * subcollection, not the `activity` feed, so there is no double source.
 */

import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';

import { errorPayload } from '../lib/errors.js';
import {
  buildNotification,
  createNotification,
  kindForActivity,
  loadMemberIndex,
  resolveRecipients,
  trimNotifications,
  userAssigneeUids,
  type INotificationDenorm,
  type TActorType,
  type TNotificationKind,
} from '../lib/notificationFanout.js';

type TActivityEvent = FirestoreEvent<
  QueryDocumentSnapshot | undefined,
  { workspaceId: string; projectId: string; activityId: string }
>;

/** Kinds whose recipients are the task watchers (assignees ∪ prior commenters). */
const TASK_WATCHER_KINDS: ReadonlySet<TNotificationKind> = new Set([
  'task_status_changed',
  'task_blocked',
  'collaborator_note_added',
  'collaborator_need_help',
]);

/** Kinds whose recipients are the project participants (assignees ∪ owner). */
const PROJECT_PARTICIPANT_KINDS: ReadonlySet<TNotificationKind> = new Set([
  'client_document_uploaded',
  'project_published',
  'project_completed',
  'project_archived',
]);

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Distinct prior user-commenter uids from a task's `updates` subcollection. */
async function priorCommenterUids(
  db: FirebaseFirestore.Firestore,
  workspaceId: string,
  projectId: string,
  taskId: string,
): Promise<string[]> {
  const snap = await db
    .collection(`workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/updates`)
    .where('authorType', '==', 'user')
    .get();
  const uids = new Set<string>();
  for (const doc of snap.docs) {
    const authorId = doc.get('authorId');
    if (typeof authorId === 'string' && authorId !== '') {
      uids.add(authorId);
    }
  }
  return [...uids];
}

/** Distinct user-assignee uids across every task in the project ∪ project owner. */
async function projectParticipantUids(
  db: FirebaseFirestore.Firestore,
  workspaceId: string,
  projectId: string,
  ownerUid: string,
): Promise<string[]> {
  const snap = await db.collection(`workspaces/${workspaceId}/projects/${projectId}/tasks`).get();
  const uids = new Set<string>();
  if (ownerUid !== '') {
    uids.add(ownerUid);
  }
  for (const doc of snap.docs) {
    for (const uid of userAssigneeUids(doc.get('assignees'))) {
      uids.add(uid);
    }
  }
  return [...uids];
}

export async function notifyInboxOnActivity(event: TActivityEvent): Promise<void> {
  const data = event.data?.data();
  if (data === undefined) {
    return;
  }
  const { workspaceId, projectId, activityId } = event.params;
  const action = asString(data['action']);
  const payload =
    typeof data['payload'] === 'object' && data['payload'] !== null
      ? (data['payload'] as Record<string, unknown>)
      : {};
  const newStatus = typeof payload['to'] === 'string' ? payload['to'] : null;
  const kind = kindForActivity(action, newStatus);
  if (kind === null) {
    return;
  }

  try {
    const db = getFirestore();
    const projectSnap = await db.doc(`workspaces/${workspaceId}/projects/${projectId}`).get();
    const projectNameDenorm = asString(projectSnap.get('name'));
    const ownerUid = asString(projectSnap.get('ownerUid'));

    const taskId = asString(data['taskId']);
    const restrictedToDepartments = asStringArray(data['restrictedToDepartments']);

    // Gather candidate uids per kind group.
    let taskAssigneeUids: string[] = [];
    let commenters: string[] = [];
    let participants: string[] = [];

    if (kind === 'task_assigned' && taskId !== '') {
      // The activity payload denormalizes ADDED assignee NAMES (not uids);
      // resolve them back to uids via the current task's user-assignees so
      // only the newly-assigned members are notified.
      const taskSnap = await db
        .doc(`workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`)
        .get();
      const addedNames = new Set(asStringArray(payload['to']));
      const assignees = taskSnap.get('assignees');
      if (Array.isArray(assignees)) {
        taskAssigneeUids = assignees
          .filter(
            (entry): entry is { type: string; id: string; name?: string } =>
              typeof entry === 'object' && entry !== null,
          )
          .filter((entry) => entry.type === 'user' && addedNames.has(asString(entry.name)))
          .map((entry) => entry.id)
          .filter((id) => typeof id === 'string' && id !== '');
      }
    } else if (TASK_WATCHER_KINDS.has(kind) && taskId !== '') {
      const taskSnap = await db
        .doc(`workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`)
        .get();
      taskAssigneeUids = userAssigneeUids(taskSnap.get('assignees'));
      commenters = await priorCommenterUids(db, workspaceId, projectId, taskId);
    } else if (PROJECT_PARTICIPANT_KINDS.has(kind)) {
      participants = await projectParticipantUids(db, workspaceId, projectId, ownerUid);
    }

    const memberIndex = await loadMemberIndex(db, workspaceId, [
      ...taskAssigneeUids,
      ...commenters,
      ...participants,
    ]);

    const recipients = resolveRecipients({
      kind,
      actorId: asString(data['actorId']),
      restrictedToDepartments,
      memberIndex,
      taskAssigneeUids,
      priorCommenterUids: commenters,
      projectParticipantUids: participants,
    });

    if (recipients.length === 0) {
      return;
    }

    const denorm: INotificationDenorm = {
      actorType: asString(data['actorType']) as TActorType,
      actorId: asString(data['actorId']),
      actorNameDenorm: asString(data['actorNameDenorm']),
      projectId,
      projectNameDenorm,
      taskId: taskId !== '' ? taskId : null,
      taskTitleDenorm: asString(data['taskTitleDenorm']) || null,
      excerpt: typeof payload['text'] === 'string' && payload['text'] !== '' ? payload['text'] : null,
      sourceActivityId: activityId,
    };

    for (const recipient of recipients) {
      // Isolate each recipient write so one failure doesn't retry the whole
      // trigger (mirrors the onTaskWrite convention).
      try {
        await createNotification(
          db,
          workspaceId,
          recipient.uid,
          activityId,
          buildNotification(recipient.kind, denorm),
        );
        await trimNotifications(db, workspaceId, recipient.uid);
      } catch (error) {
        logger.error('notifyInboxOnActivity: recipient write failed', {
          workspaceId,
          projectId,
          activityId,
          recipientUid: recipient.uid,
          err: errorPayload(error),
        });
      }
    }
  } catch (error) {
    logger.error('notifyInboxOnActivity: fan-out failed', {
      workspaceId,
      projectId,
      activityId,
      err: errorPayload(error),
    });
  }
}
