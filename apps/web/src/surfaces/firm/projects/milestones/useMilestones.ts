/**
 * Firm-side milestone CRUD (#21, Q2): direct client-SDK writes under the new
 * milestone rules (owner/admin/pm). Milestones surface on the client portal
 * as "next milestone", so this is the minimal editor in the Details tab.
 */

import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export interface IMilestoneRow {
  id: string;
  name: string;
  targetDate: Date | null;
  completedAt: Date | null;
  order: number;
}

export type TMilestonesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IMilestoneRow[] };

function mapMilestone(id: string, data: DocumentData): IMilestoneRow {
  return {
    id,
    name: String(data['name'] ?? ''),
    targetDate: data['targetDate'] instanceof Timestamp ? data['targetDate'].toDate() : null,
    completedAt: data['completedAt'] instanceof Timestamp ? data['completedAt'].toDate() : null,
    order: typeof data['order'] === 'number' ? data['order'] : 0,
  };
}

export function useMilestones(workspaceId: string, projectId: string): TMilestonesState {
  const [state, setState] = useState<TMilestonesState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      query(
        collection(db, `workspaces/${workspaceId}/projects/${projectId}/milestones`),
        orderBy('targetDate'),
      ),
      (snapshot) => {
        setState({
          status: 'ready',
          rows: snapshot.docs.map((docSnap) => mapMilestone(docSnap.id, docSnap.data())),
        });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId, projectId]);

  return state;
}

export async function addMilestone(
  workspaceId: string,
  projectId: string,
  values: { name: string; targetDate: Date },
): Promise<void> {
  const id = crypto.randomUUID();
  await setDoc(doc(db, `workspaces/${workspaceId}/projects/${projectId}/milestones/${id}`), {
    id,
    name: values.name,
    targetDate: Timestamp.fromDate(values.targetDate),
    order: Date.now(),
  });
}

export async function setMilestoneDone(
  workspaceId: string,
  projectId: string,
  milestoneId: string,
  done: boolean,
): Promise<void> {
  await updateDoc(
    doc(db, `workspaces/${workspaceId}/projects/${projectId}/milestones/${milestoneId}`),
    { completedAt: done ? Timestamp.now() : deleteField() },
  );
}

export async function removeMilestone(
  workspaceId: string,
  projectId: string,
  milestoneId: string,
): Promise<void> {
  await deleteDoc(
    doc(db, `workspaces/${workspaceId}/projects/${projectId}/milestones/${milestoneId}`),
  );
}
