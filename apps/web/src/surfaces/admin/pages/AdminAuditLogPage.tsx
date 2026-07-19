import type { IAdminLogDoc } from '@siapp/shared';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { Button } from '@siapp/ui';
import { db } from '@/lib/firebase.ts';
import { SkipLink } from '@/components/SkipLink.tsx';

const PAGE_SIZE = 50;

function formatTs(value: unknown): string {
  if (value === undefined || value === null) return '—';
  const date = value instanceof Timestamp ? value.toDate() : new Date(value as string);
  return date.toLocaleString('en-MY');
}

/** Paginated admin audit-log view ordered by ts DESC. */
export function AdminAuditLogPage() {
  const [entries, setEntries] = useState<IAdminLogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  async function loadPage(after: QueryDocumentSnapshot | null): Promise<void> {
    const baseQuery = query(
      collection(db, 'adminLog'),
      orderBy('ts', 'desc'),
      limit(PAGE_SIZE),
    );
    const q = after !== null ? query(baseQuery, startAfter(after)) : baseQuery;

    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => d.data() as IAdminLogDoc);

    if (after === null) {
      setEntries(docs);
    } else {
      setEntries((prev) => [...prev, ...docs]);
    }
    setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === PAGE_SIZE);
  }

  useEffect(() => {
    setLoading(true);
    loadPage(null)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // Intentionally mount-only: fetch the first page once. loadPage is
    // recreated each render, so listing it would refetch on every render;
    // pagination goes through handleLoadMore instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLoadMore(): Promise<void> {
    if (lastDoc === null) return;
    setLoadingMore(true);
    try {
      await loadPage(lastDoc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <SkipLink />
      <h1 className="text-xl font-semibold">Audit log</h1>

      {loading && (
        <p role="status" aria-live="polite" className="mt-6 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && error === null && entries.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No admin actions logged yet.</p>
      )}

      {entries.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm" aria-label="Admin audit log">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Admin</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Target</th>
                  <th className="py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 pr-4 text-muted-foreground">{formatTs(entry.ts)}</td>
                    <td className="py-2 pr-4">{entry.actorEmail}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{entry.action}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {entry.targetType}/{entry.targetId}
                    </td>
                    <td className="py-2 text-muted-foreground">{entry.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
