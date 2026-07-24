/**
 * Project activity timeline subscription (#23, D8): first page live via
 * onSnapshot (orderBy at desc, limit 50), older pages one-shot getDocs +
 * startAfter cursors ("Load more").
 *
 * Department need-to-know mirrors useTasks: owner/admin subscribe to the raw
 * collection; pm/viewer get one query for unrestricted entries plus one
 * `array-contains` query per claim department — merged, deduped by id, and
 * re-sorted client-side (page sizes are slightly uneven at MVP by design).
 */

import type { TActorType, TMemberRole, TProjectActivityAction } from '@siapp/shared';
import {
  Timestamp,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export const ACTIVITY_PAGE_SIZE = 50;

export interface IActivityRow {
  id: string;
  action: TProjectActivityAction;
  actorType: TActorType;
  actorName: string;
  taskTitle: string;
  docName: string;
  from: string | null;
  to: string | null;
  wouldHaveNotified: boolean;
  restrictedToDepartments: string[];
  at: Date | null;
}

export type TActivityState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IActivityRow[]; hasMore: boolean; loadingMore: boolean };

/** Maps a raw activity doc to a row; exported for tests. */
export function mapActivity(id: string, data: DocumentData): IActivityRow {
  const payload =
    typeof data['payload'] === 'object' && data['payload'] !== null
      ? (data['payload'] as Record<string, unknown>)
      : {};
  return {
    id,
    action: (data['action'] ?? 'task_created') as TProjectActivityAction,
    actorType: (data['actorType'] ?? 'system') as TActorType,
    actorName: String(data['actorNameDenorm'] ?? ''),
    taskTitle: typeof data['taskTitleDenorm'] === 'string' ? data['taskTitleDenorm'] : '',
    docName: typeof data['docNameDenorm'] === 'string' ? data['docNameDenorm'] : '',
    from: typeof payload['from'] === 'string' ? payload['from'] : null,
    to: typeof payload['to'] === 'string' ? payload['to'] : null,
    wouldHaveNotified: data['wouldHaveNotified'] === true,
    restrictedToDepartments: Array.isArray(data['restrictedToDepartments'])
      ? (data['restrictedToDepartments'] as string[]).filter((d) => typeof d === 'string')
      : [],
    at: data['at'] instanceof Timestamp ? data['at'].toDate() : null,
  };
}

/**
 * Activity queries provable against the #23 list rules; exported for tests.
 * Pass a cursor to page past it (used by loadMore).
 */
export function activityQueriesFor(
  activityPath: string,
  seesEverything: boolean,
  departments: string[],
  cursorFor?: (index: number) => QueryDocumentSnapshot | undefined,
): Query[] {
  const col = collection(db, activityPath);
  const page = (index: number, ...filters: Parameters<typeof where>[]) => {
    const cursor = cursorFor?.(index);
    return query(
      col,
      ...filters.map((args) => where(...args)),
      orderBy('at', 'desc'),
      ...(cursor !== undefined ? [startAfter(cursor)] : []),
      limit(ACTIVITY_PAGE_SIZE),
    );
  };
  return seesEverything
    ? [page(0)]
    : [
        page(0, ['restrictedToDepartments', '==', []]),
        ...departments.map((dep, i) =>
          page(i + 1, ['restrictedToDepartments', 'array-contains', dep]),
        ),
      ];
}

/** Newest first; pending serverTimestamps (at === null) sort to the top. */
function byAtDesc(a: IActivityRow, b: IActivityRow): number {
  const aMs = a.at?.getTime() ?? Number.POSITIVE_INFINITY;
  const bMs = b.at?.getTime() ?? Number.POSITIVE_INFINITY;
  return bMs - aMs || a.id.localeCompare(b.id);
}

export function useProjectActivity(
  workspaceId: string,
  projectId: string,
  role: TMemberRole,
  departments: string[],
): TActivityState & { loadMore: () => void } {
  const activityPath = `workspaces/${workspaceId}/projects/${projectId}/activity`;
  const seesEverything = role === 'owner' || role === 'admin';
  // Stable key so the effect doesn't resubscribe on every render.
  const departmentsKey = departments.join('\u0000');

  const [liveByQuery, setLiveByQuery] = useState<Map<number, IActivityRow[]> | null>(null);
  const [olderRows, setOlderRows] = useState<IActivityRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Per-query pagination cursors + exhaustion, advanced by loadMore only.
  const cursorsRef = useRef<Map<number, QueryDocumentSnapshot>>(new Map());
  const exhaustedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    setLiveByQuery(null);
    setOlderRows([]);
    setFailed(false);
    setHasMore(false);
    cursorsRef.current = new Map();
    exhaustedRef.current = new Set();
    const deps = departmentsKey === '' ? [] : departmentsKey.split('\u0000');
    const queries = activityQueriesFor(activityPath, seesEverything, deps);
    const unsubscribes = queries.map((q, index) =>
      onSnapshot(
        q,
        (snapshot) => {
          const rows = snapshot.docs.map((docSnap) => mapActivity(docSnap.id, docSnap.data()));
          // Seed the pagination cursor from the live page's last doc unless
          // loadMore already advanced past it.
          if (!cursorsRef.current.has(index) && snapshot.docs.length > 0) {
            cursorsRef.current.set(index, snapshot.docs[snapshot.docs.length - 1]);
          }
          if (snapshot.docs.length < ACTIVITY_PAGE_SIZE && !cursorsRef.current.has(index)) {
            exhaustedRef.current.add(index);
          }
          if (snapshot.docs.length >= ACTIVITY_PAGE_SIZE) {
            setHasMore(true);
          }
          setLiveByQuery((prev) => {
            const next = new Map(prev ?? []);
            next.set(index, rows);
            return next;
          });
        },
        () => setFailed(true),
      ),
    );
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [activityPath, seesEverything, departmentsKey]);

  const expectedQueryCount = seesEverything
    ? 1
    : 1 + (departmentsKey === '' ? 0 : departmentsKey.split('\u0000').length);

  const loadMore = useCallback(() => {
    if (loadingMore) {
      return;
    }
    setLoadingMore(true);
    const deps = departmentsKey === '' ? [] : departmentsKey.split('\u0000');
    const queries = activityQueriesFor(activityPath, seesEverything, deps, (index) =>
      exhaustedRef.current.has(index) ? undefined : cursorsRef.current.get(index),
    );
    void Promise.all(
      queries.map(async (q, index) => {
        if (exhaustedRef.current.has(index)) {
          return [] as IActivityRow[];
        }
        const snapshot = await getDocs(q);
        if (snapshot.docs.length > 0) {
          cursorsRef.current.set(index, snapshot.docs[snapshot.docs.length - 1]);
        }
        if (snapshot.docs.length < ACTIVITY_PAGE_SIZE) {
          exhaustedRef.current.add(index);
        }
        return snapshot.docs.map((docSnap) => mapActivity(docSnap.id, docSnap.data()));
      }),
    )
      .then((pages) => {
        setOlderRows((prev) => [...prev, ...pages.flat()]);
        setHasMore(exhaustedRef.current.size < queries.length);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoadingMore(false));
  }, [activityPath, seesEverything, departmentsKey, loadingMore]);

  return useMemo(() => {
    if (failed) {
      return { status: 'error' as const, loadMore };
    }
    if (liveByQuery === null || liveByQuery.size < expectedQueryCount) {
      return { status: 'loading' as const, loadMore };
    }
    const byId = new Map<string, IActivityRow>();
    for (const rows of liveByQuery.values()) {
      for (const row of rows) {
        byId.set(row.id, row);
      }
    }
    for (const row of olderRows) {
      if (!byId.has(row.id)) {
        byId.set(row.id, row);
      }
    }
    return {
      status: 'ready' as const,
      rows: [...byId.values()].sort(byAtDesc),
      hasMore,
      loadingMore,
      loadMore,
    };
  }, [failed, liveByQuery, olderRows, expectedQueryCount, hasMore, loadingMore, loadMore]);
}
