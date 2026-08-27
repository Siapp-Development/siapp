/**
 * Daily due-soon sweep (#18, D5). Scheduled at 00:00 UTC = 08:00 MYT — the
 * moment quiet hours end, so due-soon messages never need holding. Iterates
 * workspaces → published projects → tasks due within the next 24 h, then
 * enqueues `task_due_soon` records with deterministic ids so re-runs and
 * overlapping windows cannot double-enqueue (create() dedupe).
 *
 * #134: the same iteration additionally fans out IN-APP `task_due_soon` and
 * `task_overdue` notifications to each task's firm-member assignees. That path
 * is deliberately INDEPENDENT of the `sendWhatsapp` gate (in-app is an
 * internal channel, not the outbound WhatsApp pipeline) and uses a
 * date-bucketed deterministic id so a still-open task is re-notified at most
 * once per calendar day.
 *
 * O(all published projects) — fine at design-partner scale; needs
 * pagination/sharding before real scale (flagged in the #18 plan).
 */

import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { enqueueTaskEvent } from '../lib/enqueueNotifications.js';
import { errorPayload } from '../lib/errors.js';
import {
  buildNotification,
  createNotification,
  loadMemberIndex,
  resolveRecipients,
  trimNotifications,
  userAssigneeUids,
  type INotificationDenorm,
  type TNotificationKind,
} from '../lib/notificationFanout.js';
import { resolveNotify } from '../lib/notifyConfig.js';

/** Mirrors DUE_SOON_WINDOW_HOURS in @siapp/shared (source-only package). */
export const DUE_SOON_WINDOW_HOURS = 24;

/**
 * In-memory config filter applied after the dueDate range query (D5): the
 * task must have WhatsApp on, the dueSoon trigger enabled, and not be done.
 * Pure — unit-tests without emulators.
 */
export function isDueSoonCandidate(taskData: Record<string, unknown>): boolean {
  return (
    taskData['sendWhatsapp'] === true &&
    taskData['status'] !== 'done' &&
    resolveNotify(taskData).dueSoon
  );
}

/**
 * In-app due/overdue candidate filter (#134): notify assignees for any task
 * that is not done, INDEPENDENT of the WhatsApp toggle. Pure.
 */
export function isInAppDueCandidate(taskData: Record<string, unknown>): boolean {
  return taskData['status'] !== 'done';
}

/** UTC calendar-day bucket (yyyy-mm-dd) used to de-dupe daily in-app reminders. */
export function dueDateBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Deterministic in-app notification id for a due-soon reminder. */
export function dueSoonNid(bucket: string, taskId: string): string {
  return `duesoon_${bucket}_${taskId}`;
}

/** Deterministic in-app notification id for an overdue reminder. */
export function overdueNid(bucket: string, taskId: string): string {
  return `overdue_${bucket}_${taskId}`;
}

/**
 * Fans out one in-app due/overdue notification per department-eligible firm
 * assignee. Best-effort: never throws into the sweep.
 */
async function fanOutInAppDue(
  db: Firestore,
  workspaceId: string,
  projectId: string,
  projectName: string,
  taskId: string,
  taskData: Record<string, unknown>,
  kind: TNotificationKind,
  nid: string,
): Promise<void> {
  const taskAssigneeUids = userAssigneeUids(taskData['assignees']);
  if (taskAssigneeUids.length === 0) {
    return;
  }
  const restrictedToDepartments = Array.isArray(taskData['restrictedToDepartments'])
    ? (taskData['restrictedToDepartments'] as unknown[]).filter(
        (dep): dep is string => typeof dep === 'string',
      )
    : [];
  const memberIndex = await loadMemberIndex(db, workspaceId, taskAssigneeUids);
  const recipients = resolveRecipients({
    kind,
    // Scheduler has no human actor — exclude nobody special.
    actorId: '',
    restrictedToDepartments,
    memberIndex,
    taskAssigneeUids,
  });
  if (recipients.length === 0) {
    return;
  }
  const denorm: INotificationDenorm = {
    actorType: 'system',
    actorId: '',
    actorNameDenorm: '',
    projectId,
    projectNameDenorm: projectName,
    taskId,
    taskTitleDenorm: typeof taskData['title'] === 'string' ? taskData['title'] : null,
    excerpt: null,
    sourceActivityId: nid,
  };
  for (const recipient of recipients) {
    try {
      await createNotification(db, workspaceId, recipient.uid, nid, buildNotification(kind, denorm));
      await trimNotifications(db, workspaceId, recipient.uid);
    } catch (error) {
      logger.error('sweepDueSoon: in-app fan-out failed', {
        workspaceId,
        projectId,
        taskId,
        nid,
        recipientUid: recipient.uid,
        err: errorPayload(error),
      });
    }
  }
}

/**
 * Runs one sweep as of `now`; returns the number of WhatsApp queue docs
 * written (in-app notifications are best-effort side effects, logged on
 * failure).
 */
export async function sweepDueSoon(now: Date): Promise<number> {
  const db = getFirestore();
  const windowStart = Timestamp.fromDate(now);
  const windowEnd = Timestamp.fromMillis(now.getTime() + DUE_SOON_WINDOW_HOURS * 3_600_000);
  const bucket = dueDateBucket(now);

  let written = 0;
  const workspaces = await db.collection('workspaces').get();
  for (const workspaceSnap of workspaces.docs) {
    const projects = await workspaceSnap.ref
      .collection('projects')
      .where('lifecycle', '==', 'published')
      .get();
    for (const projectSnap of projects.docs) {
      const projectName =
        typeof projectSnap.get('name') === 'string' ? (projectSnap.get('name') as string) : '';
      // Single-field range — no composite index (D5); config filters run
      // in memory at MVP scale.
      const tasks = await projectSnap.ref
        .collection('tasks')
        .where('dueDate', '>=', windowStart)
        .where('dueDate', '<', windowEnd)
        .get();
      for (const taskSnap of tasks.docs) {
        const taskData = taskSnap.data();
        // #134 in-app due-soon — independent of the WhatsApp gate.
        if (isInAppDueCandidate(taskData)) {
          await fanOutInAppDue(
            db,
            workspaceSnap.id,
            projectSnap.id,
            projectName,
            taskSnap.id,
            taskData,
            'task_due_soon',
            dueSoonNid(bucket, taskSnap.id),
          );
        }
        if (!isDueSoonCandidate(taskData)) {
          continue;
        }
        try {
          written += await enqueueTaskEvent({
            workspaceId: workspaceSnap.id,
            projectId: projectSnap.id,
            taskId: taskSnap.id,
            trigger: 'task_due_soon',
            taskData,
            projectData: projectSnap.data(),
            now,
          });
        } catch (error) {
          // One bad task must not abort the whole sweep.
          logger.error('dueSoonSweep: enqueue failed', {
            workspaceId: workspaceSnap.id,
            projectId: projectSnap.id,
            taskId: taskSnap.id,
            err: errorPayload(error),
          });
        }
      }

      // #134 in-app overdue — tasks whose dueDate is already past and still
      // open. Separate single-field range query; no WhatsApp equivalent.
      const overdue = await projectSnap.ref
        .collection('tasks')
        .where('dueDate', '<', windowStart)
        .get();
      for (const taskSnap of overdue.docs) {
        const taskData = taskSnap.data();
        if (!isInAppDueCandidate(taskData)) {
          continue;
        }
        await fanOutInAppDue(
          db,
          workspaceSnap.id,
          projectSnap.id,
          projectName,
          taskSnap.id,
          taskData,
          'task_overdue',
          overdueNid(bucket, taskSnap.id),
        );
      }
    }
  }
  return written;
}
