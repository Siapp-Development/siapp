/**
 * Daily due-soon sweep (#18, D5). Scheduled at 00:00 UTC = 08:00 MYT — the
 * moment quiet hours end, so due-soon messages never need holding. Iterates
 * workspaces → published projects → tasks due within the next 24 h, then
 * enqueues `task_due_soon` records with deterministic ids so re-runs and
 * overlapping windows cannot double-enqueue (create() dedupe).
 *
 * O(all published projects) — fine at design-partner scale; needs
 * pagination/sharding before real scale (flagged in the #18 plan).
 */

import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { enqueueTaskEvent } from '../lib/enqueueNotifications.js';
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

/** Runs one sweep as of `now`; returns the number of queue docs written. */
export async function sweepDueSoon(now: Date): Promise<number> {
  const db = getFirestore();
  const windowStart = Timestamp.fromDate(now);
  const windowEnd = Timestamp.fromMillis(now.getTime() + DUE_SOON_WINDOW_HOURS * 3_600_000);

  let written = 0;
  const workspaces = await db.collection('workspaces').get();
  for (const workspaceSnap of workspaces.docs) {
    const projects = await workspaceSnap.ref
      .collection('projects')
      .where('lifecycle', '==', 'published')
      .get();
    for (const projectSnap of projects.docs) {
      // Single-field range — no composite index (D5); config filters run
      // in memory at MVP scale.
      const tasks = await projectSnap.ref
        .collection('tasks')
        .where('dueDate', '>=', windowStart)
        .where('dueDate', '<', windowEnd)
        .get();
      for (const taskSnap of tasks.docs) {
        const taskData = taskSnap.data();
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
            error,
          });
        }
      }
    }
  }
  return written;
}
