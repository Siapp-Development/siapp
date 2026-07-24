/**
 * Duplicate project (#15, D-031): structure carries, content clears.
 *
 * Task titles, order, phase grouping, dependency links, restrictedToDepartments,
 * visibleToClient and sendWhatsapp carry; assignees, dates, statuses, updates,
 * documents and % complete clear. The copy starts as a draft; the onTaskWrite
 * trigger recomputes its summary as the copied tasks land.
 *
 * The write path is a single client-side `writeBatch` validated by the same
 * rules as manual creation — no Cloud Function, so a caller can never copy a
 * task they couldn't see. pm callers with hidden restricted tasks are blocked
 * outright (decision 2) rather than partially copied.
 */

import type { TMemberRole, TTaskAssignee } from '@siapp/shared';
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

import { getRestrictedTaskHeaders } from '@/lib/callables.ts';
import { db } from '@/lib/firebase.ts';

import { mapPhase, mapTask, taskQueriesFor, type ITaskRow } from './tasks/useTasks.ts';
import type { IProjectFormValues } from './useProjects.ts';

/** Firestore's hard cap on operations in a single atomic batch. */
const MAX_BATCH_OPS = 500;

/** The source has restricted tasks hidden from the caller (decision 2). */
export class DuplicateBlockedError extends Error {
  readonly hiddenCount: number;

  constructor(hiddenCount: number) {
    super(`Duplicate blocked: ${hiddenCount} restricted task(s) are hidden from the caller`);
    this.name = 'DuplicateBlockedError';
    this.hiddenCount = hiddenCount;
  }
}

/** The copy would exceed the 500-op batch limit — no chunking at MVP. */
export class DuplicateTooLargeError extends Error {
  constructor(totalWrites: number) {
    super(`Project too large to duplicate: ${totalWrites} writes exceed the batch limit`);
    this.name = 'DuplicateTooLargeError';
  }
}

// ---------------------------------------------------------------------------
// Pure planner — no Firebase imports; plain rows in, plain docs out.
// ---------------------------------------------------------------------------

export interface IDuplicatePhaseSource {
  id: string;
  name: string;
  order: number;
}

export interface IDuplicateTaskSource {
  id: string;
  title: string;
  description: string;
  phaseId: string | null;
  order: number;
  visibleToClient: boolean;
  restrictedToDepartments: string[];
  sendWhatsapp: boolean;
  dependsOn: string[];
}

export interface IDuplicatePhaseDoc {
  id: string;
  name: string;
  order: number;
  status: 'todo';
}

export interface IDuplicateTaskDoc {
  id: string;
  title: string;
  /** '' means the source had no description — omitted at write time. */
  description: string;
  /** Remapped to the copied phase's id; null when unphased or dangling. */
  phaseId: string | null;
  status: 'todo';
  assignees: TTaskAssignee[];
  visibleToClient: boolean;
  visibleToCollaboratorIds: string[];
  restrictedToDepartments: string[];
  sendWhatsapp: boolean;
  /** Remapped to copied task ids; dangling entries dropped. */
  dependsOn: string[];
  order: number;
}

export interface IDuplicatePlan {
  phases: IDuplicatePhaseDoc[];
  tasks: IDuplicateTaskDoc[];
}

/**
 * Builds the copied phase/task docs with fresh ids from `idFor`, remapping
 * `phaseId` and `dependsOn` through old→new id maps and applying the D-031
 * copy/clear table. dependsOn entries pointing at tasks that no longer exist
 * (stale ids — task delete doesn't clean up inbound deps) are dropped.
 */
export function buildDuplicatePlan(
  sourcePhases: readonly IDuplicatePhaseSource[],
  sourceTasks: readonly IDuplicateTaskSource[],
  idFor: () => string,
): IDuplicatePlan {
  const phaseEntries = sourcePhases.map((phase) => ({ phase, newId: idFor() }));
  const taskEntries = sourceTasks.map((task) => ({ task, newId: idFor() }));
  const phaseIdMap = new Map(phaseEntries.map(({ phase, newId }) => [phase.id, newId]));
  const taskIdMap = new Map(taskEntries.map(({ task, newId }) => [task.id, newId]));

  const phases: IDuplicatePhaseDoc[] = phaseEntries.map(({ phase, newId }) => ({
    id: newId,
    name: phase.name,
    order: phase.order,
    status: 'todo',
  }));

  const tasks: IDuplicateTaskDoc[] = taskEntries.map(({ task, newId }) => ({
    id: newId,
    title: task.title,
    description: task.description,
    phaseId: task.phaseId !== null ? (phaseIdMap.get(task.phaseId) ?? null) : null,
    status: 'todo',
    assignees: [],
    visibleToClient: task.visibleToClient,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [...task.restrictedToDepartments],
    sendWhatsapp: task.sendWhatsapp,
    dependsOn: task.dependsOn
      .map((dep) => taskIdMap.get(dep))
      .filter((dep): dep is string => dep !== undefined),
    order: task.order,
  }));

  return { phases, tasks };
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

export interface IDuplicateProjectArgs {
  workspaceId: string;
  sourceProjectId: string;
  /** Values from the (prefilled) project form — name, code, dates, etc. */
  values: IProjectFormValues;
  uid: string;
  ownerName: string;
  role: TMemberRole;
  departments: string[];
}

/**
 * Reads the source structure, then commits the copy atomically: project doc
 * (same shape as `createProject` plus `duplicatedFromProjectId`) + phase docs
 * + task docs. Returns the new project id.
 *
 * @throws DuplicateBlockedError when a pm caller cannot see every task.
 * @throws DuplicateTooLargeError when the copy would exceed the batch limit.
 */
export async function duplicateProject(args: IDuplicateProjectArgs): Promise<string> {
  const { workspaceId, sourceProjectId, values, uid, ownerName, role, departments } = args;
  const sourcePath = `workspaces/${workspaceId}/projects/${sourceProjectId}`;
  const seesEverything = role === 'owner' || role === 'admin';

  const phasesSnap = await getDocs(collection(db, `${sourcePath}/phases`));
  const sourcePhases = phasesSnap.docs.map((docSnap) => mapPhase(docSnap.id, docSnap.data()));

  const taskSnaps = await Promise.all(
    taskQueriesFor(`${sourcePath}/tasks`, seesEverything, departments).map((q) => getDocs(q)),
  );
  const tasksById = new Map<string, ITaskRow>();
  for (const snap of taskSnaps) {
    for (const docSnap of snap.docs) {
      tasksById.set(docSnap.id, mapTask(docSnap.id, docSnap.data()));
    }
  }
  const sourceTasks = [...tasksById.values()];

  if (!seesEverything) {
    const { headers } = await getRestrictedTaskHeaders({
      workspaceId,
      projectId: sourceProjectId,
    });
    if (headers.length > 0) {
      throw new DuplicateBlockedError(headers.length);
    }
  }

  const totalWrites = 1 + sourcePhases.length + sourceTasks.length;
  if (totalWrites > MAX_BATCH_OPS) {
    throw new DuplicateTooLargeError(totalWrites);
  }

  const projectsPath = `workspaces/${workspaceId}/projects`;
  const projectRef = doc(collection(db, projectsPath));
  const plan = buildDuplicatePlan(
    sourcePhases,
    sourceTasks,
    () => doc(collection(db, projectsPath)).id,
  );

  const batch = writeBatch(db);
  batch.set(projectRef, {
    id: projectRef.id,
    name: values.name,
    ...(values.code !== '' ? { code: values.code } : {}),
    vertical: values.vertical,
    lifecycle: 'draft',
    status: values.status,
    clientId: values.clientId,
    clientNameDenorm: values.clientName,
    ownerUid: uid,
    ownerNameDenorm: ownerName,
    startDate: Timestamp.fromDate(values.startDate),
    ...(values.targetEndDate !== null
      ? { targetEndDate: Timestamp.fromDate(values.targetEndDate) }
      : {}),
    summary: { totalTasks: 0, doneTasks: 0, overdueTasks: 0, progressPct: 0 },
    visibility: { clientCanSee: values.clientCanSee, collaboratorsCount: 0 },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    duplicatedFromProjectId: sourceProjectId,
  });
  for (const phase of plan.phases) {
    batch.set(doc(db, `${projectsPath}/${projectRef.id}/phases/${phase.id}`), phase);
  }
  for (const task of plan.tasks) {
    batch.set(doc(db, `${projectsPath}/${projectRef.id}/tasks/${task.id}`), {
      id: task.id,
      title: task.title,
      ...(task.description !== '' ? { description: task.description } : {}),
      ...(task.phaseId !== null ? { phaseId: task.phaseId } : {}),
      status: task.status,
      assignees: task.assignees,
      visibleToClient: task.visibleToClient,
      visibleToCollaboratorIds: task.visibleToCollaboratorIds,
      restrictedToDepartments: task.restrictedToDepartments,
      sendWhatsapp: task.sendWhatsapp,
      dependsOn: task.dependsOn,
      order: task.order,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
    });
  }
  await batch.commit();
  return projectRef.id;
}
