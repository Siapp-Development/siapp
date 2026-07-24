/**
 * Live Firestore subscriptions + direct writes for the projects surface (#12).
 * Field CRUD is client-side (rules-validated for owner/admin/pm); lifecycle
 * transitions go through the setProjectLifecycle callable instead.
 */

import type { TProjectLifecycle, TProjectStatus, TProjectVertical } from '@siapp/shared';
import {
  Timestamp,
  collection,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export interface IProjectRow {
  id: string;
  name: string;
  code: string;
  vertical: TProjectVertical;
  lifecycle: TProjectLifecycle;
  status: TProjectStatus;
  clientId: string;
  clientNameDenorm: string;
  ownerNameDenorm: string;
  startDate: Date | null;
  targetEndDate: Date | null;
  progressPct: number;
  totalTasks: number;
  doneTasks: number;
  overdueTasks: number;
  clientCanSee: boolean;
  collaboratorsCount: number;
}

export type TProjectsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IProjectRow[] };

export type TProjectState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; project: IProjectRow };

function asDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function mapProject(id: string, data: DocumentData): IProjectRow {
  const summary = (data['summary'] ?? {}) as Record<string, unknown>;
  const visibility = (data['visibility'] ?? {}) as Record<string, unknown>;
  return {
    id,
    name: String(data['name'] ?? ''),
    code: typeof data['code'] === 'string' ? data['code'] : '',
    vertical: (data['vertical'] ?? 'other') as TProjectVertical,
    lifecycle: (data['lifecycle'] ?? 'draft') as TProjectLifecycle,
    status: (data['status'] ?? 'planning') as TProjectStatus,
    clientId: typeof data['clientId'] === 'string' ? data['clientId'] : '',
    clientNameDenorm: String(data['clientNameDenorm'] ?? ''),
    ownerNameDenorm: String(data['ownerNameDenorm'] ?? ''),
    startDate: asDate(data['startDate']),
    targetEndDate: asDate(data['targetEndDate']),
    progressPct: typeof summary['progressPct'] === 'number' ? summary['progressPct'] : 0,
    totalTasks: typeof summary['totalTasks'] === 'number' ? summary['totalTasks'] : 0,
    doneTasks: typeof summary['doneTasks'] === 'number' ? summary['doneTasks'] : 0,
    overdueTasks: typeof summary['overdueTasks'] === 'number' ? summary['overdueTasks'] : 0,
    clientCanSee: visibility['clientCanSee'] === true,
    collaboratorsCount:
      typeof visibility['collaboratorsCount'] === 'number' ? visibility['collaboratorsCount'] : 0,
  };
}

export function useProjects(workspaceId: string): TProjectsState {
  const [state, setState] = useState<TProjectsState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      collection(db, `workspaces/${workspaceId}/projects`),
      (snapshot) => {
        setState({
          status: 'ready',
          rows: snapshot.docs.map((docSnap) => mapProject(docSnap.id, docSnap.data())),
        });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId]);

  return state;
}

export function useProject(workspaceId: string, projectId: string): TProjectState {
  const [state, setState] = useState<TProjectState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      doc(db, `workspaces/${workspaceId}/projects/${projectId}`),
      (snapshot) => {
        const data = snapshot.data();
        setState(
          data === undefined
            ? { status: 'missing' }
            : { status: 'ready', project: mapProject(snapshot.id, data) },
        );
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId, projectId]);

  return state;
}

export interface IProjectFormValues {
  name: string;
  code: string;
  vertical: TProjectVertical;
  status: TProjectStatus;
  /** '' when no client is linked; rules require clientId/clientName paired (#16). */
  clientId: string;
  /** Denormalized display name for the linked client; '' when unlinked. */
  clientName: string;
  startDate: Date;
  targetEndDate: Date | null;
  clientCanSee: boolean;
}

/**
 * Creates a draft project. The doc shape must satisfy the #12 create rule:
 * lifecycle 'draft', zeroed summary, collaboratorsCount 0, caller as
 * ownerUid/createdBy. clientId/clientNameDenorm are paired — both set or
 * both '' (#16).
 */
export async function createProject(
  workspaceId: string,
  values: IProjectFormValues,
  uid: string,
  ownerName: string,
): Promise<string> {
  const ref = doc(collection(db, `workspaces/${workspaceId}/projects`));
  await setDoc(ref, {
    id: ref.id,
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
  });
  return ref.id;
}

/** Edits the client-editable fields; rules reject non-draft/published docs. */
export async function updateProject(
  workspaceId: string,
  projectId: string,
  values: Omit<IProjectFormValues, 'vertical'>,
  collaboratorsCount: number,
): Promise<void> {
  await updateDoc(doc(db, `workspaces/${workspaceId}/projects/${projectId}`), {
    name: values.name,
    code: values.code !== '' ? values.code : deleteField(),
    status: values.status,
    clientId: values.clientId,
    clientNameDenorm: values.clientName,
    startDate: Timestamp.fromDate(values.startDate),
    targetEndDate:
      values.targetEndDate !== null ? Timestamp.fromDate(values.targetEndDate) : deleteField(),
    visibility: { clientCanSee: values.clientCanSee, collaboratorsCount },
    updatedAt: serverTimestamp(),
  });
}
