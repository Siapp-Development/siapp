/**
 * Per-collaborator assigned-tasks mirror (#127, decision C1). Maintains
 * `workspaces/{wid}/collaborators/{colid}/assignedTasks/{pid}_{tid}` snapshot
 * docs so a collaborator's single access link can live-query every task
 * assigned to them across projects, without iterating the un-queryable
 * `assignees` object array.
 *
 * `onTaskWrite` fans a task's assignee diff out to add/remove/update mirror
 * docs; `onProjectWrite` refreshes `projectName`/`lifecycle` across a project's
 * mirror docs on rename / lifecycle change. Precedent: recomputeProjectSummary.
 *
 * The diffing is pure so it unit-tests without emulators; the Admin writes
 * live in the applier functions below.
 */

import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

export interface ITaskMirrorInput {
  assignees?: unknown;
  visibleToCollaboratorIds?: unknown;
  title?: unknown;
  status?: unknown;
  /** Firestore Timestamp | undefined — passed through unchanged. */
  dueDate?: unknown;
}

export interface IProjectMirrorInput {
  name?: unknown;
  lifecycle?: unknown;
}

/** Snapshot fields written to a mirror doc (updatedAt stamped by the applier). */
export interface IMirrorSnapshot {
  projectId: string;
  taskId: string;
  title: string;
  status: string;
  dueDate?: unknown;
  projectName: string;
  lifecycle: string;
  visibleToThisCollaborator: boolean;
}

export type TMirrorOp =
  | { kind: 'set'; colid: string; data: IMirrorSnapshot }
  | { kind: 'delete'; colid: string };

/** Collaborator-type assignee ids from a task's `assignees` object array. */
export function collaboratorAssigneeIds(assignees: unknown): string[] {
  if (!Array.isArray(assignees)) {
    return [];
  }
  const ids: string[] = [];
  for (const entry of assignees) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>)['type'] === 'collaborator' &&
      typeof (entry as Record<string, unknown>)['id'] === 'string' &&
      (entry as Record<string, unknown>)['id'] !== ''
    ) {
      const id = (entry as Record<string, unknown>)['id'] as string;
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

/** True when the task is visible to this collaborator (empty list = all). */
export function taskVisibleToCollaborator(
  visibleToCollaboratorIds: unknown,
  colid: string,
): boolean {
  if (!Array.isArray(visibleToCollaboratorIds)) {
    return true;
  }
  return visibleToCollaboratorIds.length === 0 || visibleToCollaboratorIds.includes(colid);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function snapshotFor(
  colid: string,
  projectId: string,
  taskId: string,
  task: ITaskMirrorInput,
  project: IProjectMirrorInput,
): IMirrorSnapshot {
  const dueDate = task.dueDate;
  return {
    projectId,
    taskId,
    title: str(task.title),
    status: str(task.status, 'todo'),
    ...(dueDate !== undefined && dueDate !== null ? { dueDate } : {}),
    projectName: str(project.name),
    lifecycle: str(project.lifecycle, 'draft'),
    visibleToThisCollaborator: taskVisibleToCollaborator(task.visibleToCollaboratorIds, colid),
  };
}

/**
 * Pure diff for one task write: which collaborator mirror docs to set/delete.
 * A deleted task (after === undefined) removes every prior collaborator's doc.
 */
export function diffTaskMirror(params: {
  projectId: string;
  taskId: string;
  before: ITaskMirrorInput | undefined;
  after: ITaskMirrorInput | undefined;
  project: IProjectMirrorInput;
}): TMirrorOp[] {
  const { projectId, taskId, before, after, project } = params;
  const beforeIds = new Set(collaboratorAssigneeIds(before?.assignees));
  const afterIds = collaboratorAssigneeIds(after?.assignees);
  const afterSet = new Set(afterIds);
  const ops: TMirrorOp[] = [];

  if (after !== undefined) {
    for (const colid of afterIds) {
      ops.push({ kind: 'set', colid, data: snapshotFor(colid, projectId, taskId, after, project) });
    }
  }
  for (const colid of beforeIds) {
    if (!afterSet.has(colid)) {
      ops.push({ kind: 'delete', colid });
    }
  }
  return ops;
}

/** Applies mirror ops via the Admin SDK. `db` defaults to the default app. */
export async function applyMirrorOps(
  workspaceId: string,
  projectId: string,
  taskId: string,
  ops: readonly TMirrorOp[],
  db: Firestore = getFirestore(),
): Promise<void> {
  const docId = `${projectId}_${taskId}`;
  await Promise.all(
    ops.map((op) => {
      const ref = db.doc(
        `workspaces/${workspaceId}/collaborators/${op.colid}/assignedTasks/${docId}`,
      );
      if (op.kind === 'delete') {
        return ref.delete();
      }
      return ref.set({ ...op.data, updatedAt: FieldValue.serverTimestamp() });
    }),
  );
}

/**
 * Refreshes projectName / lifecycle across every mirror doc of a project on
 * rename or lifecycle change: re-reads the project's tasks and re-sets the
 * mirror docs for each task's current collaborator assignees.
 */
export async function refreshProjectMirror(
  workspaceId: string,
  projectId: string,
  project: IProjectMirrorInput,
  db: Firestore = getFirestore(),
): Promise<void> {
  const tasksSnap = await db
    .collection(`workspaces/${workspaceId}/projects/${projectId}/tasks`)
    .get();
  await Promise.all(
    tasksSnap.docs.map(async (taskDoc) => {
      const task = taskDoc.data() as ITaskMirrorInput;
      const ops = diffTaskMirror({
        projectId,
        taskId: taskDoc.id,
        before: undefined,
        after: task,
        project,
      });
      await applyMirrorOps(workspaceId, projectId, taskDoc.id, ops, db);
    }),
  );
}
