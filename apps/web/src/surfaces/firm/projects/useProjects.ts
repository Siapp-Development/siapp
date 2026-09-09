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

export interface IProjectClientRef {
  id: string;
  name: string;
}

export interface IProjectRow {
  id: string;
  name: string;
  description: string;
  code: string;
  vertical: TProjectVertical;
  lifecycle: TProjectLifecycle;
  status: TProjectStatus;
  /**
   * Membership list of linked client ids (#157). Rules-queryable; mirrors the
   * `assigneeCollaboratorIds` precedent. Legacy single-client docs resolve to a
   * one-entry array via {@link mapProject}.
   */
  clientIds: string[];
  /** Denormalized `{id,name}` display refs, parallel to {@link clientIds}. */
  clients: IProjectClientRef[];
  /** @deprecated Legacy single-client id — mirrors `clientIds[0]` during the dual-write window (#157). */
  clientId: string;
  /** @deprecated Legacy single-client name — mirrors `clients[0].name` during the dual-write window (#157). */
  clientNameDenorm: string;
  ownerNameDenorm: string;
  startDate: Date | null;
  targetEndDate: Date | null;
  /** Server `updatedAt`; drives the projects-list "last updated" sort. */
  updatedAt: Date | null;
  progressPct: number;
  totalTasks: number;
  doneTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  clientCanSee: boolean;
  collaboratorsCount: number;
  /** projectTags ids (D-041); missing → []. */
  tags: string[];
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asClientRefs(value: unknown): IProjectClientRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): IProjectClientRef[] => {
    if (entry === null || typeof entry !== 'object') {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const id = typeof record['id'] === 'string' ? record['id'] : '';
    if (id === '') {
      return [];
    }
    return [{ id, name: typeof record['name'] === 'string' ? record['name'] : '' }];
  });
}

/**
 * Resolves the multi-client fields with a legacy single-client fallback (#157,
 * D5): a doc not yet backfilled has only `clientId`/`clientNameDenorm`, which we
 * surface as a one-entry list so the firm UI is uniform.
 */
function resolveClients(data: DocumentData): { clientIds: string[]; clients: IProjectClientRef[] } {
  const clients = asClientRefs(data['clients']);
  const clientIds = asStringArray(data['clientIds']);
  if (clientIds.length > 0) {
    return { clientIds, clients };
  }
  const legacyId = typeof data['clientId'] === 'string' ? data['clientId'] : '';
  if (legacyId === '') {
    return { clientIds: [], clients: [] };
  }
  return {
    clientIds: [legacyId],
    clients: [{ id: legacyId, name: String(data['clientNameDenorm'] ?? '') }],
  };
}

function mapProject(id: string, data: DocumentData): IProjectRow {
  const summary = (data['summary'] ?? {}) as Record<string, unknown>;
  const visibility = (data['visibility'] ?? {}) as Record<string, unknown>;
  const { clientIds, clients } = resolveClients(data);
  return {
    id,
    name: String(data['name'] ?? ''),
    description: typeof data['description'] === 'string' ? data['description'] : '',
    code: typeof data['code'] === 'string' ? data['code'] : '',
    vertical: (data['vertical'] ?? 'other') as TProjectVertical,
    lifecycle: (data['lifecycle'] ?? 'draft') as TProjectLifecycle,
    status: (data['status'] ?? 'planning') as TProjectStatus,
    clientIds,
    clients,
    clientId: clientIds[0] ?? '',
    clientNameDenorm: clients[0]?.name ?? '',
    ownerNameDenorm: String(data['ownerNameDenorm'] ?? ''),
    startDate: asDate(data['startDate']),
    targetEndDate: asDate(data['targetEndDate']),
    updatedAt: asDate(data['updatedAt']),
    progressPct: typeof summary['progressPct'] === 'number' ? summary['progressPct'] : 0,
    totalTasks: typeof summary['totalTasks'] === 'number' ? summary['totalTasks'] : 0,
    doneTasks: typeof summary['doneTasks'] === 'number' ? summary['doneTasks'] : 0,
    overdueTasks: typeof summary['overdueTasks'] === 'number' ? summary['overdueTasks'] : 0,
    // Absent on projects untouched since the #17 trigger deploy — treat as 0.
    blockedTasks: typeof summary['blockedTasks'] === 'number' ? summary['blockedTasks'] : 0,
    clientCanSee: visibility['clientCanSee'] === true,
    collaboratorsCount:
      typeof visibility['collaboratorsCount'] === 'number' ? visibility['collaboratorsCount'] : 0,
    tags: asStringArray(data['tags']),
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
  description: string;
  code: string;
  vertical: TProjectVertical;
  status: TProjectStatus;
  /** Linked client ids (#157). Empty when no client is linked; capped at 5. */
  clientIds: string[];
  /** Denormalized `{id,name}` refs, parallel to {@link clientIds}. */
  clients: IProjectClientRef[];
  startDate: Date;
  targetEndDate: Date | null;
  clientCanSee: boolean;
}

/**
 * Derives the legacy single-client dual-write fields from the multi-client
 * arrays (#157, D5): legacy readers keep working off `clientId`/
 * `clientNameDenorm`, which mirror the FIRST linked client (or '' when none).
 */
function legacyClientFields(values: Pick<IProjectFormValues, 'clientIds' | 'clients'>): {
  clientId: string;
  clientNameDenorm: string;
} {
  const firstId = values.clientIds[0] ?? '';
  const firstName = values.clients.find((client) => client.id === firstId)?.name ?? '';
  return { clientId: firstId, clientNameDenorm: firstName };
}

/**
 * Creates a draft project. The doc shape must satisfy the #12 create rule:
 * lifecycle 'draft', zeroed summary, collaboratorsCount 0, caller as
 * ownerUid/createdBy. Writes the #157 `clientIds`/`clients` arrays AND the
 * legacy `clientId`/`clientNameDenorm` pair (dual-write, D5).
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
    ...(values.description !== '' ? { description: values.description } : {}),
    ...(values.code !== '' ? { code: values.code } : {}),
    vertical: values.vertical,
    lifecycle: 'draft',
    status: values.status,
    clientIds: values.clientIds,
    clients: values.clients,
    ...legacyClientFields(values),
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
    description: values.description !== '' ? values.description : deleteField(),
    code: values.code !== '' ? values.code : deleteField(),
    status: values.status,
    clientIds: values.clientIds,
    clients: values.clients,
    ...legacyClientFields(values),
    startDate: Timestamp.fromDate(values.startDate),
    targetEndDate:
      values.targetEndDate !== null ? Timestamp.fromDate(values.targetEndDate) : deleteField(),
    visibility: { clientCanSee: values.clientCanSee, collaboratorsCount },
    updatedAt: serverTimestamp(),
  });
}

/**
 * Persists only a project's `tags` (projectTags ids) + `updatedAt`. Tags are
 * edited inline via `TagSelect`, not through `ProjectForm`; the update rule
 * allowlists `tags` for owner/admin/pm on draft/published projects.
 */
export async function updateProjectTags(
  workspaceId: string,
  projectId: string,
  tags: string[],
): Promise<void> {
  await updateDoc(doc(db, `workspaces/${workspaceId}/projects/${projectId}`), {
    tags,
    updatedAt: serverTimestamp(),
  });
}
