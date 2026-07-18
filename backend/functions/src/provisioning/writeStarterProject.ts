/**
 * Applies an `ISeedDefinition` to Firestore under `workspaces/{wid}/projects/{pid}`.
 * All writes land in a single batched write (max 500 ops; the largest seed has
 * ~58 tasks + 7 phases + 1 project doc = 66 ops — safely within one batch).
 * Returns the new project id.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import type { ISeedDefinition } from './seedTypes.js';

/**
 * Writes the starter project (phases + tasks) described by `seed` under
 * `workspaces/{wid}`. Returns the generated project id.
 */
export async function writeStarterProject(
  wid: string,
  seed: ISeedDefinition,
  ownerUid: string,
  ownerName: string,
): Promise<string> {
  const db = getFirestore();

  // Generate a random project id using Firestore's built-in id allocator.
  const pid = db.collection('_').doc().id;
  const projectRef = db.doc(`workspaces/${wid}/projects/${pid}`);

  const batch = db.batch();

  // ── Project document ────────────────────────────────────────────────────
  batch.set(projectRef, {
    id: pid,
    name: `${seed.label} Starter`,
    vertical: seed.vertical,
    lifecycle: 'draft',
    status: 'planning',
    ownerUid,
    ownerNameDenorm: ownerName,
    // clientId is required by the schema but not yet assigned at seed time.
    clientId: '',
    clientNameDenorm: '',
    summary: {
      totalTasks: seed.tasks.length,
      doneTasks: 0,
      overdueTasks: 0,
      progressPct: 0,
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // ── Phase documents ─────────────────────────────────────────────────────
  // Use IPhaseDef.id as the Firestore doc id (stable, human-readable).
  for (const phase of seed.phases) {
    const phaseRef = db.doc(`workspaces/${wid}/projects/${pid}/phases/${phase.id}`);
    batch.set(phaseRef, {
      id: phase.id,
      name: phase.name,
      order: phase.order,
      status: 'todo',
    });
  }

  // ── Task documents ──────────────────────────────────────────────────────
  // Assign deterministic task ids so dependsOn references are stable and
  // so a re-run (if ever needed) produces the same ids.
  const taskIdMap = new Map<string, string>();
  for (const task of seed.tasks) {
    const firestoreTaskId = `task-${seed.vertical}-${String(task.order).padStart(3, '0')}`;
    taskIdMap.set(task.id, firestoreTaskId);
  }

  for (const task of seed.tasks) {
    const firestoreTaskId = taskIdMap.get(task.id);
    if (firestoreTaskId === undefined) {
      throw new Error(`Task id ${task.id} not found in taskIdMap`);
    }
    const taskRef = db.doc(`workspaces/${wid}/projects/${pid}/tasks/${firestoreTaskId}`);

    // Resolve dependsOn local ids → Firestore ids.
    const dependsOn = (task.dependsOn ?? []).map((localId) => {
      const resolved = taskIdMap.get(localId);
      if (resolved === undefined) {
        throw new Error(`dependsOn reference ${localId} not found in task ${task.id}`);
      }
      return resolved;
    });

    batch.set(taskRef, {
      id: firestoreTaskId,
      title: task.title,
      order: task.order,
      phaseId: task.phaseRef,
      status: 'todo',
      dependsOn,
      visibleToClient: task.visibleToClient,
      visibleToCollaboratorIds: [],
      restrictedToDepartments: task.restrictedToDepartments,
      sendWhatsapp: task.sendWhatsapp,
      assignees: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  return pid;
}
