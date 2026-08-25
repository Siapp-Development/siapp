/**
 * Live portal task subscription (#126, D-042). Reads the project `tasks`
 * subcollection for the first time from the portal, constrained to the
 * rules-provable equality query (`visibleToClient == true` AND
 * `restrictedToDepartments == []`). Both `where` clauses are REQUIRED — the
 * rule references those fields directly, so a query missing either is denied.
 *
 * The mapper reads ONLY the client-safe whitelist (id, title, status,
 * phaseId, startDate, dueDate, completedAt, order); internal fields
 * (description, assignees, blockedReason, tags, …) are never surfaced. Sort
 * is client-side (phase order, then task order) so no composite index is
 * needed — mirrors usePortalDocuments.
 */

import type { TTaskStatus } from '@siapp/shared';
import {
  Timestamp,
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

import type { IPortalPhase } from '../usePortalProject.ts';

/** Client-safe task projection — the ONLY fields exposed to the portal. */
export interface IPortalTask {
  id: string;
  title: string;
  status: TTaskStatus;
  phaseId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  order: number;
}

/** A phase (or the trailing unphased bucket) with its client-visible tasks. */
export interface IPortalTaskGroup {
  /** Phase id, or null for the unphased bucket. */
  phaseId: string | null;
  name: string;
  tasks: IPortalTask[];
}

export type TPortalTasksState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tasks: IPortalTask[]; groups: IPortalTaskGroup[] };

/** Label for the trailing bucket of tasks with no phase. */
export const UNPHASED_GROUP_LABEL = 'Other tasks';

function asDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function asStatus(value: unknown): TTaskStatus {
  return value === 'in_progress' || value === 'blocked' || value === 'done' ? value : 'todo';
}

/** Reads ONLY the client-safe whitelist keys — internal fields never leak. */
function mapTask(id: string, data: DocumentData): IPortalTask {
  const phaseId = data['phaseId'];
  return {
    id,
    title: String(data['title'] ?? ''),
    status: asStatus(data['status']),
    phaseId: typeof phaseId === 'string' && phaseId !== '' ? phaseId : null,
    startDate: asDate(data['startDate']),
    dueDate: asDate(data['dueDate']),
    completedAt: asDate(data['completedAt']),
    order: typeof data['order'] === 'number' ? data['order'] : 0,
  };
}

/**
 * Groups tasks under their phase (using phase order/names) with a trailing
 * unphased bucket, dropping empty groups. Tasks are sorted client-side by
 * `order` within each group.
 */
export function groupPortalTasks(
  tasks: readonly IPortalTask[],
  phases: readonly IPortalPhase[],
): IPortalTaskGroup[] {
  const byPhase = new Map<string | null, IPortalTask[]>();
  for (const task of tasks) {
    const key = task.phaseId;
    const bucket = byPhase.get(key);
    if (bucket === undefined) {
      byPhase.set(key, [task]);
    } else {
      bucket.push(task);
    }
  }

  const orderedPhases = [...phases].sort((a, b) => a.order - b.order);
  const groups: IPortalTaskGroup[] = [];
  for (const phase of orderedPhases) {
    const bucket = byPhase.get(phase.id);
    if (bucket !== undefined && bucket.length > 0) {
      groups.push({
        phaseId: phase.id,
        name: phase.name,
        tasks: bucket.sort((a, b) => a.order - b.order),
      });
    }
  }

  const unphased = byPhase.get(null);
  if (unphased !== undefined && unphased.length > 0) {
    groups.push({
      phaseId: null,
      name: UNPHASED_GROUP_LABEL,
      tasks: unphased.sort((a, b) => a.order - b.order),
    });
  }

  return groups;
}

export function usePortalTasks(
  workspaceId: string,
  projectId: string,
  phases: readonly IPortalPhase[],
): TPortalTasksState {
  const [tasks, setTasks] = useState<IPortalTask[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    setTasks('loading');
    // Equality-only filters (rules-provable, no composite index). BOTH clauses
    // are required by the portal `list` grant — sort is client-side.
    return onSnapshot(
      query(
        collection(db, `workspaces/${workspaceId}/projects/${projectId}/tasks`),
        where('visibleToClient', '==', true),
        where('restrictedToDepartments', '==', []),
      ),
      (snapshot) => {
        setTasks(snapshot.docs.map((docSnap) => mapTask(docSnap.id, docSnap.data())));
      },
      () => setTasks('error'),
    );
  }, [workspaceId, projectId]);

  if (tasks === 'error') {
    return { status: 'error' };
  }
  if (tasks === 'loading') {
    return { status: 'loading' };
  }
  return { status: 'ready', tasks, groups: groupPortalTasks(tasks, phases) };
}
