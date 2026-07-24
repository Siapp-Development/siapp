/**
 * Recomputes the pre-aggregated `project.summary` counters after a task write
 * (#12, exercised further by tasks CRUD in #13; `blockedTasks` added for the
 * #17 dashboard health chip). Reads the full task collection inside a
 * transaction — fine at MVP volume (starter seeds are ~60 tasks); the data
 * model allows adding a 2s debounce later if needed.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/** Minimal snapshot surface so the counter math is testable without admin SDK mocks. */
export interface ITaskFieldReader {
  get(field: string): unknown;
}

export interface ISummaryCounters {
  totalTasks: number;
  doneTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  progressPct: number;
}

/**
 * Pure counter math over the task snapshots. Overdue = non-done with a due
 * date in the past; blocked counts `status == 'blocked'` regardless of due
 * date (health precedence is decided client-side: overdue > blocked).
 */
export function computeSummaryCounters(
  tasks: readonly ITaskFieldReader[],
  nowMs: number,
): ISummaryCounters {
  let doneTasks = 0;
  let overdueTasks = 0;
  let blockedTasks = 0;
  for (const snap of tasks) {
    const status = snap.get('status') as unknown;
    if (status === 'done') {
      doneTasks += 1;
      continue;
    }
    if (status === 'blocked') {
      blockedTasks += 1;
    }
    const dueDate = snap.get('dueDate') as { toMillis?: () => number } | undefined;
    if (typeof dueDate?.toMillis === 'function' && dueDate.toMillis() < nowMs) {
      overdueTasks += 1;
    }
  }
  const totalTasks = tasks.length;
  return {
    totalTasks,
    doneTasks,
    overdueTasks,
    blockedTasks,
    progressPct: totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100),
  };
}

export async function recomputeProjectSummary(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const db = getFirestore();
  const projectRef = db.doc(`workspaces/${workspaceId}/projects/${projectId}`);
  const tasksRef = projectRef.collection('tasks');

  await db.runTransaction(async (txn) => {
    const projectSnap = await txn.get(projectRef);
    if (!projectSnap.exists) {
      return; // project deleted concurrently — nothing to aggregate onto
    }
    const tasks = await txn.get(tasksRef);

    txn.update(projectRef, {
      summary: {
        ...computeSummaryCounters(tasks.docs, Date.now()),
        lastActivityAt: FieldValue.serverTimestamp(),
      },
    });
  });
}
