/**
 * Recomputes the pre-aggregated `project.summary` counters after a task write
 * (#12, exercised further by tasks CRUD in #13). Reads the full task
 * collection inside a transaction — fine at MVP volume (starter seeds are
 * ~60 tasks); the data model allows adding a 2s debounce later if needed.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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

    const nowMs = Date.now();
    let doneTasks = 0;
    let overdueTasks = 0;
    for (const snap of tasks.docs) {
      const status = snap.get('status') as unknown;
      if (status === 'done') {
        doneTasks += 1;
        continue;
      }
      const dueDate = snap.get('dueDate') as { toMillis?: () => number } | undefined;
      if (typeof dueDate?.toMillis === 'function' && dueDate.toMillis() < nowMs) {
        overdueTasks += 1;
      }
    }
    const totalTasks = tasks.size;

    txn.update(projectRef, {
      summary: {
        totalTasks,
        doneTasks,
        overdueTasks,
        progressPct: totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100),
        lastActivityAt: FieldValue.serverTimestamp(),
      },
    });
  });
}
