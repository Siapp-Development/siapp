/**
 * Live portal reads (#21): project doc + phases + milestones under the
 * portal rules grants. Progress is the server-maintained summary.progressPct
 * (D5) — never recomputed client-side.
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

export interface IPortalMilestone {
  id: string;
  name: string;
  targetDate: Date | null;
  completedAt: Date | null;
  description: string;
}

export type TPortalProjectState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      project: IPortalProject;
      phases: IPortalPhase[];
      milestones: IPortalMilestone[];
    };

function asDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function mapProject(data: DocumentData): IPortalProject {
  const summary = (data['summary'] ?? {}) as Record<string, unknown>;
  return {
    name: String(data['name'] ?? ''),
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

function mapMilestone(id: string, data: DocumentData): IPortalMilestone {
  return {
    id,
    name: String(data['name'] ?? ''),
    targetDate: asDate(data['targetDate']),
    completedAt: asDate(data['completedAt']),
    description: typeof data['description'] === 'string' ? data['description'] : '',
  };
}

/** The client's "current phase": first in-progress, else first todo, else last done. */
export function currentPhase(phases: IPortalPhase[]): IPortalPhase | null {
  return (
    phases.find((phase) => phase.status === 'in_progress') ??
    phases.find((phase) => phase.status === 'todo') ??
    phases.at(-1) ??
    null
  );
}

/** Earliest incomplete milestone by target date, or null. */
export function nextMilestone(milestones: IPortalMilestone[]): IPortalMilestone | null {
  return milestones.find((milestone) => milestone.completedAt === null) ?? null;
}

export function usePortalProject(workspaceId: string, projectId: string): TPortalProjectState {
  const [project, setProject] = useState<IPortalProject | 'loading' | 'error'>('loading');
  const [phases, setPhases] = useState<IPortalPhase[] | 'loading' | 'error'>('loading');
  const [milestones, setMilestones] = useState<IPortalMilestone[] | 'loading' | 'error'>(
    'loading',
  );

  useEffect(() => {
    setProject('loading');
    setPhases('loading');
    setMilestones('loading');
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
      onSnapshot(
        query(collection(db, `${prefix}/milestones`), orderBy('targetDate')),
        (snapshot) => {
          setMilestones(snapshot.docs.map((docSnap) => mapMilestone(docSnap.id, docSnap.data())));
        },
        () => setMilestones('error'),
      ),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [workspaceId, projectId]);

  if (project === 'error' || phases === 'error' || milestones === 'error') {
    return { status: 'error' };
  }
  if (project === 'loading' || phases === 'loading' || milestones === 'loading') {
    return { status: 'loading' };
  }
  return { status: 'ready', project, phases, milestones };
}
