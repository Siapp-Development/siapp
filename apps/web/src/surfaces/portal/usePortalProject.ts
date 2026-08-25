/**
 * Live portal reads (#21): project doc + phases under the portal rules
 * grants. Progress is the server-maintained summary.progressPct (D5) — never
 * recomputed client-side. Phases are read for task-group headers/order/labels
 * (#126, D-042); milestones are no longer rendered in the portal, so that
 * subscription and the current-phase/next-milestone helpers were removed.
 */

import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export interface IPortalProject {
  name: string;
  clientName: string;
  lifecycle: string;
  startDate: Date | null;
  targetEndDate: Date | null;
  progressPct: number;
}

export interface IPortalPhase {
  id: string;
  name: string;
  order: number;
  status: 'todo' | 'in_progress' | 'done';
}

export type TPortalProjectState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      project: IPortalProject;
      phases: IPortalPhase[];
    };

function asDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function mapProject(data: DocumentData): IPortalProject {
  const summary = (data['summary'] ?? {}) as Record<string, unknown>;
  return {
    name: String(data['name'] ?? ''),
    clientName: String(data['clientNameDenorm'] ?? ''),
    lifecycle: String(data['lifecycle'] ?? ''),
    startDate: asDate(data['startDate']),
    targetEndDate: asDate(data['targetEndDate']),
    progressPct: typeof summary['progressPct'] === 'number' ? summary['progressPct'] : 0,
  };
}

function mapPhase(id: string, data: DocumentData): IPortalPhase {
  const status = data['status'];
  return {
    id,
    name: String(data['name'] ?? ''),
    order: typeof data['order'] === 'number' ? data['order'] : 0,
    status: status === 'in_progress' || status === 'done' ? status : 'todo',
  };
}

export function usePortalProject(workspaceId: string, projectId: string): TPortalProjectState {
  const [project, setProject] = useState<IPortalProject | 'loading' | 'error'>('loading');
  const [phases, setPhases] = useState<IPortalPhase[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    setProject('loading');
    setPhases('loading');
    const prefix = `workspaces/${workspaceId}/projects/${projectId}`;
    const unsubscribes = [
      onSnapshot(
        doc(db, prefix),
        (snapshot) => {
          const data = snapshot.data();
          setProject(data === undefined ? 'error' : mapProject(data));
        },
        () => setProject('error'),
      ),
      onSnapshot(
        query(collection(db, `${prefix}/phases`), orderBy('order')),
        (snapshot) => {
          setPhases(snapshot.docs.map((docSnap) => mapPhase(docSnap.id, docSnap.data())));
        },
        () => setPhases('error'),
      ),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [workspaceId, projectId]);

  if (project === 'error' || phases === 'error') {
    return { status: 'error' };
  }
  if (project === 'loading' || phases === 'loading') {
    return { status: 'loading' };
  }
  return { status: 'ready', project, phases };
}
