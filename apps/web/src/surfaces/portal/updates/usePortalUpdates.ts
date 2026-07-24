/**
 * Client-safe updates feed (#21, D4): live query over the project activity
 * subcollection constrained to `visibleToClient == true` — the rules prove
 * the list against that filter and the (visibleToClient, at desc) composite
 * index serves it. Pagination widens the subscription limit.
 */

import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export const UPDATES_PAGE_SIZE = 30;

export interface IPortalUpdate {
  id: string;
  action: string;
  taskTitleDenorm: string;
  docNameDenorm: string;
  at: Date | null;
  payload: { from?: unknown; to?: unknown };
}

export type TPortalUpdatesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IPortalUpdate[]; hasMore: boolean };

function mapUpdate(id: string, data: DocumentData): IPortalUpdate {
  return {
    id,
    action: String(data['action'] ?? ''),
    taskTitleDenorm: typeof data['taskTitleDenorm'] === 'string' ? data['taskTitleDenorm'] : '',
    docNameDenorm: typeof data['docNameDenorm'] === 'string' ? data['docNameDenorm'] : '',
    at: data['at'] instanceof Timestamp ? data['at'].toDate() : null,
    payload:
      typeof data['payload'] === 'object' && data['payload'] !== null
        ? (data['payload'] as { from?: unknown; to?: unknown })
        : {},
  };
}

export function usePortalUpdates(
  workspaceId: string,
  projectId: string,
  pageSize: number = UPDATES_PAGE_SIZE,
): { state: TPortalUpdatesState; loadMore: () => void } {
  const [state, setState] = useState<TPortalUpdatesState>({ status: 'loading' });
  const [currentLimit, setCurrentLimit] = useState(pageSize);

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      query(
        collection(db, `workspaces/${workspaceId}/projects/${projectId}/activity`),
        where('visibleToClient', '==', true),
        orderBy('at', 'desc'),
        limit(currentLimit),
      ),
      (snapshot) => {
        setState({
          status: 'ready',
          rows: snapshot.docs.map((docSnap) => mapUpdate(docSnap.id, docSnap.data())),
          hasMore: snapshot.docs.length === currentLimit,
        });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId, projectId, currentLimit]);

  const loadMore = useCallback(
    () => setCurrentLimit((current) => current + pageSize),
    [pageSize],
  );

  return { state, loadMore };
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

/** Client-friendly one-line label for a feed entry. */
export function updateLabel(update: IPortalUpdate): string {
  const to = typeof update.payload.to === 'string' ? update.payload.to : '';
  switch (update.action) {
    case 'task_created':
      return `New task: ${update.taskTitleDenorm}`;
    case 'task_status_changed':
      return `${update.taskTitleDenorm} moved to ${STATUS_LABELS[to] ?? to}`;
    case 'task_due_date_changed':
      return `${update.taskTitleDenorm} has a new target date`;
    case 'doc_added':
      return `New document: ${update.docNameDenorm}`;
    case 'client_document_uploaded':
      return `You shared ${update.docNameDenorm}`;
    case 'project_published':
      return 'Your project is underway';
    case 'project_completed':
      return 'Your project is complete';
    default:
      return 'Project updated';
  }
}
