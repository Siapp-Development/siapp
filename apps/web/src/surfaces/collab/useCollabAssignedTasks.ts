/**
 * Live query of a collaborator's assigned-tasks mirror (#127): every task
 * assigned to them across projects that is on a live project and visible to
 * them. Powers the "My Assigned Tasks" switcher.
 *
 * Q1 ordering (resolved): active-first (active = status !== 'done'), then due
 * date ascending (missing due dates last), then title. Flat list, computed
 * client-side; the mirror stores status + dueDate.
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

export interface IAssignedTaskRow {
  /** `${projectId}_${taskId}` — stable option key. */
  key: string;
  projectId: string;
  taskId: string;
  title: string;
  status: TTaskStatus;
  dueDate: Date | null;
  projectName: string;
  /** Derived: status !== 'done'. */
  active: boolean;
}

export type TCollabAssignedTasksState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IAssignedTaskRow[] };

function mapRow(id: string, data: DocumentData): IAssignedTaskRow {
  const rawStatus = data['status'];
  const status: TTaskStatus =
    rawStatus === 'in_progress' || rawStatus === 'blocked' || rawStatus === 'done'
      ? rawStatus
      : 'todo';
  return {
    key: id,
    projectId: String(data['projectId'] ?? ''),
    taskId: String(data['taskId'] ?? ''),
    title: String(data['title'] ?? ''),
    status,
    dueDate: data['dueDate'] instanceof Timestamp ? data['dueDate'].toDate() : null,
    projectName: String(data['projectName'] ?? ''),
    active: status !== 'done',
  };
}

/** Q1 comparator: active desc → dueDate asc (missing last) → title asc. */
export function compareAssignedTasks(a: IAssignedTaskRow, b: IAssignedTaskRow): number {
  if (a.active !== b.active) {
    return a.active ? -1 : 1;
  }
  if (a.dueDate !== null && b.dueDate !== null) {
    const diff = a.dueDate.getTime() - b.dueDate.getTime();
    if (diff !== 0) {
      return diff;
    }
  } else if (a.dueDate !== null) {
    return -1;
  } else if (b.dueDate !== null) {
    return 1;
  }
  return a.title.localeCompare(b.title);
}

export function useCollabAssignedTasks(
  workspaceId: string,
  collaboratorId: string,
): TCollabAssignedTasksState {
  const [state, setState] = useState<TCollabAssignedTasksState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    // Rules-proved query: reads only this collaborator's own subcollection
    // (colid == claim.colid). Composite index: visibleToThisCollaborator +
    // lifecycle + dueDate (firestore.indexes.json).
    return onSnapshot(
      query(
        collection(db, `workspaces/${workspaceId}/collaborators/${collaboratorId}/assignedTasks`),
        where('visibleToThisCollaborator', '==', true),
        where('lifecycle', 'in', ['published', 'completed']),
      ),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => mapRow(docSnap.id, docSnap.data()));
        rows.sort(compareAssignedTasks);
        setState({ status: 'ready', rows });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId, collaboratorId]);

  return state;
}
