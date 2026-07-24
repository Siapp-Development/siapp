/**
 * Live Firestore subscriptions + direct writes for the tasks surface (#13).
 * Task/phase CRUD is client-side (rules-validated for owner/admin/pm) except
 * task hard-delete, which flows through the deleteTask callable (#23 Q5);
 * activity entries are append-only client writes pinned to the caller.
 *
 * Department need-to-know: rules prove list queries against the query, so
 * pm/viewer cannot subscribe to the raw collection. They get one query for
 * unrestricted tasks plus one `array-contains` query per claim department
 * (deduped by id, sorted client-side — no composite indexes), and a one-shot
 * getRestrictedTaskHeaders callable for the dimmed "Restricted" rows.
 */

import type {
  IRestrictedTaskHeader,
  ITaskNotifyConfig,
  TMemberRole,
  TPhaseStatus,
  TTaskAssignee,
  TTaskStatus,
  TTaskUpdateAction,
} from '@siapp/shared';
import { TASK_NOTIFY_DEFAULTS } from '@siapp/shared';
import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { deleteTask as deleteTaskCallable, getRestrictedTaskHeaders } from '@/lib/callables.ts';
import { db } from '@/lib/firebase.ts';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface ITaskRow {
  restricted: false;
  id: string;
  title: string;
  description: string;
  phaseId: string | null;
  status: TTaskStatus;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  assignees: TTaskAssignee[];
  visibleToClient: boolean;
  visibleToCollaboratorIds: string[];
  restrictedToDepartments: string[];
  sendWhatsapp: boolean;
  notify: ITaskNotifyConfig;
  dependsOn: string[];
  order: number;
  createdBy: string;
}

/** Dimmed header row for a task the member cannot read (A3/A5d). */
export interface IRestrictedHeaderRow {
  restricted: true;
  id: string;
  title: string;
  status: TTaskStatus;
  phaseId: string | null;
  dueDate: Date | null;
  order: number;
  restrictedToDepartments: string[];
}

export type TTaskListRow = ITaskRow | IRestrictedHeaderRow;

export type TTasksState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: TTaskListRow[] };

export interface IPhaseRow {
  id: string;
  name: string;
  order: number;
  startDate: Date | null;
  endDate: Date | null;
  status: TPhaseStatus;
}

export type TPhasesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IPhaseRow[] };

export interface ITaskUpdateRow {
  id: string;
  authorId: string;
  authorNameDenorm: string;
  action: TTaskUpdateAction;
  text: string;
  mentions: string[];
  from: string;
  to: string;
  createdAt: Date | null;
}

export type TTaskUpdatesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: ITaskUpdateRow[] };

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function asDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Effective notify config: stored map with defaults for absent keys (#18 D2). */
function mapNotify(value: unknown): ITaskNotifyConfig {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    statusChange:
      typeof raw['statusChange'] === 'boolean'
        ? raw['statusChange']
        : TASK_NOTIFY_DEFAULTS.statusChange,
    dueSoon: typeof raw['dueSoon'] === 'boolean' ? raw['dueSoon'] : TASK_NOTIFY_DEFAULTS.dueSoon,
    blocked: typeof raw['blocked'] === 'boolean' ? raw['blocked'] : TASK_NOTIFY_DEFAULTS.blocked,
    toClient:
      typeof raw['toClient'] === 'boolean' ? raw['toClient'] : TASK_NOTIFY_DEFAULTS.toClient,
    toInternal:
      typeof raw['toInternal'] === 'boolean' ? raw['toInternal'] : TASK_NOTIFY_DEFAULTS.toInternal,
  };
}

/** Maps a raw task doc to a row; exported for the #15 duplicate reader. */
export function mapTask(id: string, data: DocumentData): ITaskRow {
  return {
    restricted: false,
    id,
    title: String(data['title'] ?? ''),
    description: typeof data['description'] === 'string' ? data['description'] : '',
    phaseId: typeof data['phaseId'] === 'string' ? data['phaseId'] : null,
    status: (data['status'] ?? 'todo') as TTaskStatus,
    startDate: asDate(data['startDate']),
    dueDate: asDate(data['dueDate']),
    completedAt: asDate(data['completedAt']),
    assignees: Array.isArray(data['assignees']) ? (data['assignees'] as TTaskAssignee[]) : [],
    visibleToClient: data['visibleToClient'] === true,
    visibleToCollaboratorIds: asStringArray(data['visibleToCollaboratorIds']),
    restrictedToDepartments: asStringArray(data['restrictedToDepartments']),
    sendWhatsapp: data['sendWhatsapp'] === true,
    notify: mapNotify(data['notify']),
    dependsOn: asStringArray(data['dependsOn']),
    order: typeof data['order'] === 'number' ? data['order'] : 0,
    createdBy: String(data['createdBy'] ?? ''),
  };
}

/** Maps a raw phase doc to a row; exported for the #15 duplicate reader. */
export function mapPhase(id: string, data: DocumentData): IPhaseRow {
  return {
    id,
    name: String(data['name'] ?? ''),
    order: typeof data['order'] === 'number' ? data['order'] : 0,
    startDate: asDate(data['startDate']),
    endDate: asDate(data['endDate']),
    status: (data['status'] ?? 'todo') as TPhaseStatus,
  };
}

/**
 * Task queries provable against the #13 list rules: owner/admin subscribe to
 * the whole collection; pm/viewer get one query for unrestricted tasks plus
 * one `array-contains` query per claim department (results deduped by id).
 */
export function taskQueriesFor(
  tasksPath: string,
  seesEverything: boolean,
  departments: string[],
): Query[] {
  return seesEverything
    ? [query(collection(db, tasksPath))]
    : [
        query(collection(db, tasksPath), where('restrictedToDepartments', '==', [])),
        ...departments.map((dep) =>
          query(collection(db, tasksPath), where('restrictedToDepartments', 'array-contains', dep)),
        ),
      ];
}

function mapHeader(header: IRestrictedTaskHeader): IRestrictedHeaderRow {
  return {
    restricted: true,
    id: header.id,
    title: header.title,
    status: header.status,
    phaseId: header.phaseId,
    dueDate: header.dueDate !== null ? new Date(header.dueDate) : null,
    order: header.order,
    restrictedToDepartments: header.restrictedToDepartments,
  };
}

function byOrder(a: TTaskListRow, b: TTaskListRow): number {
  return a.order - b.order || a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useTasks(
  workspaceId: string,
  projectId: string,
  role: TMemberRole,
  departments: string[],
): TTasksState & { refreshRestricted: () => void } {
  const tasksPath = `workspaces/${workspaceId}/projects/${projectId}/tasks`;
  const seesEverything = role === 'owner' || role === 'admin';
  // Stable key so the effect doesn't resubscribe on every render.
  const departmentsKey = departments.join('\u0000');

  const [docsByQuery, setDocsByQuery] = useState<Map<number, ITaskRow[]> | null>(null);
  const [failed, setFailed] = useState(false);
  const [headers, setHeaders] = useState<IRestrictedHeaderRow[] | null>(null);
  const [restrictedFetch, setRestrictedFetch] = useState(0);

  useEffect(() => {
    setDocsByQuery(null);
    setFailed(false);
    const deps = departmentsKey === '' ? [] : departmentsKey.split('\u0000');
    const queries = taskQueriesFor(tasksPath, seesEverything, deps);
    const unsubscribes = queries.map((q, index) =>
      onSnapshot(
        q,
        (snapshot) => {
          const rows = snapshot.docs.map((docSnap) => mapTask(docSnap.id, docSnap.data()));
          setDocsByQuery((prev) => {
            const next = new Map(prev ?? []);
            next.set(index, rows);
            return next;
          });
        },
        () => setFailed(true),
      ),
    );
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [tasksPath, seesEverything, departmentsKey]);

  useEffect(() => {
    if (seesEverything) {
      setHeaders([]);
      return;
    }
    setHeaders(null);
    let cancelled = false;
    getRestrictedTaskHeaders({ workspaceId, projectId })
      .then((response) => {
        if (!cancelled) {
          setHeaders(response.headers.map(mapHeader));
        }
      })
      .catch(() => {
        // Headers are a progressive enhancement — the visible list still works.
        if (!cancelled) {
          setHeaders([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId, seesEverything, restrictedFetch]);

  const refreshRestricted = useCallback(() => setRestrictedFetch((n) => n + 1), []);

  const expectedQueryCount = seesEverything
    ? 1
    : 1 + (departmentsKey === '' ? 0 : departmentsKey.split('\u0000').length);

  return useMemo(() => {
    if (failed) {
      return { status: 'error' as const, refreshRestricted };
    }
    if (docsByQuery === null || docsByQuery.size < expectedQueryCount || headers === null) {
      return { status: 'loading' as const, refreshRestricted };
    }
    const byId = new Map<string, TTaskListRow>();
    for (const rows of docsByQuery.values()) {
      for (const row of rows) {
        byId.set(row.id, row);
      }
    }
    for (const header of headers) {
      if (!byId.has(header.id)) {
        byId.set(header.id, header);
      }
    }
    return {
      status: 'ready' as const,
      rows: [...byId.values()].sort(byOrder),
      refreshRestricted,
    };
  }, [docsByQuery, failed, headers, expectedQueryCount, refreshRestricted]);
}

export function usePhases(workspaceId: string, projectId: string): TPhasesState {
  const [state, setState] = useState<TPhasesState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      collection(db, `workspaces/${workspaceId}/projects/${projectId}/phases`),
      (snapshot) => {
        const rows = snapshot.docs
          .map((docSnap) => mapPhase(docSnap.id, docSnap.data()))
          .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
        setState({ status: 'ready', rows });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId, projectId]);

  return state;
}

export function useTaskUpdates(
  workspaceId: string,
  projectId: string,
  taskId: string,
): TTaskUpdatesState {
  const [state, setState] = useState<TTaskUpdatesState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      query(
        collection(db, `workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/updates`),
        orderBy('createdAt', 'asc'),
      ),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const payload = (data['payload'] ?? {}) as Record<string, unknown>;
          return {
            id: docSnap.id,
            authorId: String(data['authorId'] ?? ''),
            authorNameDenorm: String(data['authorNameDenorm'] ?? ''),
            action: (data['action'] ?? 'comment') as TTaskUpdateAction,
            text: typeof payload['text'] === 'string' ? payload['text'] : '',
            mentions: asStringArray(payload['mentions']),
            from: typeof payload['from'] === 'string' ? payload['from'] : '',
            to: typeof payload['to'] === 'string' ? payload['to'] : '',
            createdAt: asDate(data['createdAt']),
          };
        });
        setState({ status: 'ready', rows });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId, projectId, taskId]);

  return state;
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

export interface ITaskFormValues {
  title: string;
  description: string;
  phaseId: string | null;
  status: TTaskStatus;
  startDate: Date | null;
  dueDate: Date | null;
  assignees: TTaskAssignee[];
  visibleToClient: boolean;
  restrictedToDepartments: string[];
  sendWhatsapp: boolean;
  /** Absent on quick-add — backend applies TASK_NOTIFY_DEFAULTS (#18). */
  notify?: ITaskNotifyConfig;
  dependsOn: string[];
}

export async function createTask(
  workspaceId: string,
  projectId: string,
  values: ITaskFormValues,
  order: number,
  uid: string,
): Promise<string> {
  const ref = doc(collection(db, `workspaces/${workspaceId}/projects/${projectId}/tasks`));
  await setDoc(ref, {
    id: ref.id,
    title: values.title,
    ...(values.description !== '' ? { description: values.description } : {}),
    ...(values.phaseId !== null ? { phaseId: values.phaseId } : {}),
    status: values.status,
    ...(values.startDate !== null ? { startDate: Timestamp.fromDate(values.startDate) } : {}),
    ...(values.dueDate !== null ? { dueDate: Timestamp.fromDate(values.dueDate) } : {}),
    ...(values.status === 'done' ? { completedAt: serverTimestamp() } : {}),
    assignees: values.assignees,
    visibleToClient: values.visibleToClient,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: values.restrictedToDepartments,
    sendWhatsapp: values.sendWhatsapp,
    ...(values.notify !== undefined ? { notify: values.notify } : {}),
    dependsOn: values.dependsOn,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  return ref.id;
}

export async function updateTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  values: ITaskFormValues,
  wasDone: boolean,
  uid: string,
): Promise<void> {
  const nowDone = values.status === 'done';
  await updateDoc(doc(db, `workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`), {
    title: values.title,
    description: values.description !== '' ? values.description : deleteField(),
    phaseId: values.phaseId !== null ? values.phaseId : deleteField(),
    status: values.status,
    startDate: values.startDate !== null ? Timestamp.fromDate(values.startDate) : deleteField(),
    dueDate: values.dueDate !== null ? Timestamp.fromDate(values.dueDate) : deleteField(),
    ...(nowDone && !wasDone ? { completedAt: serverTimestamp() } : {}),
    ...(!nowDone ? { completedAt: deleteField() } : {}),
    assignees: values.assignees,
    visibleToClient: values.visibleToClient,
    restrictedToDepartments: values.restrictedToDepartments,
    sendWhatsapp: values.sendWhatsapp,
    ...(values.notify !== undefined ? { notify: values.notify } : {}),
    dependsOn: values.dependsOn,
    updatedAt: serverTimestamp(),
    // #23: rules require updatedBy == auth.uid so activity is attributable.
    updatedBy: uid,
  });
}

/**
 * #23 Q5: hard-deletes flow through the deleteTask callable so the activity
 * entry is attributed (rules deny client task deletes).
 */
export async function deleteTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
): Promise<void> {
  await deleteTaskCallable({ workspaceId, projectId, taskId });
}

export interface IPhaseFormValues {
  name: string;
  status: TPhaseStatus;
}

export async function createPhase(
  workspaceId: string,
  projectId: string,
  name: string,
  order: number,
): Promise<string> {
  const ref = doc(collection(db, `workspaces/${workspaceId}/projects/${projectId}/phases`));
  await setDoc(ref, { id: ref.id, name, order, status: 'todo' });
  return ref.id;
}

export async function updatePhase(
  workspaceId: string,
  projectId: string,
  phaseId: string,
  values: IPhaseFormValues,
): Promise<void> {
  await updateDoc(doc(db, `workspaces/${workspaceId}/projects/${projectId}/phases/${phaseId}`), {
    name: values.name,
    status: values.status,
  });
}

export async function deletePhase(
  workspaceId: string,
  projectId: string,
  phaseId: string,
): Promise<void> {
  await deleteDoc(doc(db, `workspaces/${workspaceId}/projects/${projectId}/phases/${phaseId}`));
}

export interface ITaskUpdateInput {
  action: TTaskUpdateAction;
  text?: string;
  mentions?: string[];
  from?: string;
  to?: string;
}

export async function addTaskUpdate(
  workspaceId: string,
  projectId: string,
  taskId: string,
  input: ITaskUpdateInput,
  uid: string,
  authorName: string,
): Promise<void> {
  const ref = doc(
    collection(db, `workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/updates`),
  );
  await setDoc(ref, {
    id: ref.id,
    authorType: 'user',
    authorId: uid,
    authorNameDenorm: authorName,
    source: 'web',
    action: input.action,
    payload: {
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.mentions !== undefined && input.mentions.length > 0
        ? { mentions: input.mentions }
        : {}),
      ...(input.from !== undefined ? { from: input.from } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
    },
    createdAt: serverTimestamp(),
  });
}
