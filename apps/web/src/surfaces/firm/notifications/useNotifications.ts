/**
 * Notification inbox subscription (#134). One realtime query for the first
 * page (`onSnapshot`, `orderBy('at','desc')`, `limit(30)`) plus one-shot
 * `getDocs` + `startAfter` pages for "Load more". No department split is
 * needed — fan-out already resolved need-to-know (D-025), so every doc under
 * `members/{uid}/notifications` is readable by this member.
 *
 * Mirrors `useProjectActivity.ts`'s discriminated-union state + pagination
 * shape. Exposes `markRead(id)` and `markAllRead()` write helpers.
 */

import type { TActorType, TNotificationKind } from '@siapp/shared';
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export const NOTIFICATIONS_PAGE_SIZE = 30;
/** Upper bound on a single "mark all read" batch — matches the retention cap. */
export const MARK_ALL_READ_LIMIT = 100;

export interface INotificationRow {
  id: string;
  kind: TNotificationKind;
  read: boolean;
  actorType: TActorType;
  actorName: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskTitle: string | null;
  excerpt: string | null;
  at: Date | null;
}

export type TNotificationsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: INotificationRow[]; hasMore: boolean; loadingMore: boolean };

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Maps a raw notification doc to a row; exported for tests. */
export function mapNotification(id: string, data: DocumentData): INotificationRow {
  return {
    id,
    kind: (data['kind'] ?? 'task_status_changed') as TNotificationKind,
    read: data['read'] === true,
    actorType: (data['actorType'] ?? 'system') as TActorType,
    actorName: asString(data['actorNameDenorm']),
    projectId: asString(data['projectId']),
    projectName: asString(data['projectNameDenorm']),
    taskId: asNullableString(data['taskId']),
    taskTitle: asNullableString(data['taskTitleDenorm']),
    excerpt: asNullableString(data['excerpt']),
    at: data['at'] instanceof Timestamp ? data['at'].toDate() : null,
  };
}

/** Newest first; pending serverTimestamps (at === null) sort to the top. */
function byAtDesc(a: INotificationRow, b: INotificationRow): number {
  const aMs = a.at?.getTime() ?? Number.POSITIVE_INFINITY;
  const bMs = b.at?.getTime() ?? Number.POSITIVE_INFINITY;
  return bMs - aMs || a.id.localeCompare(b.id);
}

export interface IUseNotifications {
  state: TNotificationsState;
  loadMore: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useNotifications(workspaceId: string, uid: string): IUseNotifications {
  const path = `workspaces/${workspaceId}/members/${uid}/notifications`;

  const [liveRows, setLiveRows] = useState<INotificationRow[] | null>(null);
  const [olderRows, setOlderRows] = useState<INotificationRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const exhaustedRef = useRef(false);

  useEffect(() => {
    setLiveRows(null);
    setOlderRows([]);
    setFailed(false);
    setHasMore(false);
    cursorRef.current = null;
    exhaustedRef.current = false;
    const col = collection(db, path);
    const unsubscribe = onSnapshot(
      query(col, orderBy('at', 'desc'), limit(NOTIFICATIONS_PAGE_SIZE)),
      (snapshot) => {
        setLiveRows(snapshot.docs.map((docSnap) => mapNotification(docSnap.id, docSnap.data())));
        if (cursorRef.current === null && snapshot.docs.length > 0) {
          cursorRef.current = snapshot.docs[snapshot.docs.length - 1];
        }
        if (snapshot.docs.length >= NOTIFICATIONS_PAGE_SIZE) {
          setHasMore(true);
        }
      },
      () => setFailed(true),
    );
    return () => unsubscribe();
  }, [path]);

  const loadMore = useCallback(() => {
    if (loadingMore || exhaustedRef.current || cursorRef.current === null) {
      return;
    }
    setLoadingMore(true);
    const col = collection(db, path);
    void getDocs(
      query(
        col,
        orderBy('at', 'desc'),
        startAfter(cursorRef.current),
        limit(NOTIFICATIONS_PAGE_SIZE),
      ),
    )
      .then((snapshot) => {
        if (snapshot.docs.length > 0) {
          cursorRef.current = snapshot.docs[snapshot.docs.length - 1];
        }
        if (snapshot.docs.length < NOTIFICATIONS_PAGE_SIZE) {
          exhaustedRef.current = true;
          setHasMore(false);
        }
        setOlderRows((prev) => [
          ...prev,
          ...snapshot.docs.map((docSnap) => mapNotification(docSnap.id, docSnap.data())),
        ]);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoadingMore(false));
  }, [path, loadingMore]);

  const markRead = useCallback(
    async (id: string): Promise<void> => {
      await updateDoc(doc(db, `${path}/${id}`), { read: true, readAt: serverTimestamp() });
    },
    [path],
  );

  const markAllRead = useCallback(async (): Promise<void> => {
    const col = collection(db, path);
    const unread = await getDocs(query(col, where('read', '==', false), limit(MARK_ALL_READ_LIMIT)));
    if (unread.empty) {
      return;
    }
    const batch = writeBatch(db);
    for (const docSnap of unread.docs) {
      batch.update(docSnap.ref, { read: true, readAt: serverTimestamp() });
    }
    await batch.commit();
  }, [path]);

  const state = useMemo<TNotificationsState>(() => {
    if (failed) {
      return { status: 'error' };
    }
    if (liveRows === null) {
      return { status: 'loading' };
    }
    const byId = new Map<string, INotificationRow>();
    for (const row of liveRows) {
      byId.set(row.id, row);
    }
    for (const row of olderRows) {
      if (!byId.has(row.id)) {
        byId.set(row.id, row);
      }
    }
    return {
      status: 'ready',
      rows: [...byId.values()].sort(byAtDesc),
      hasMore,
      loadingMore,
    };
  }, [failed, liveRows, olderRows, hasMore, loadingMore]);

  return { state, loadMore, markRead, markAllRead };
}
