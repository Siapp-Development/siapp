import type { IWorkspaceDoc } from '@siapp/shared';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { db } from '@/lib/firebase.ts';
import { SkipLink } from '@/components/SkipLink.tsx';

type TWorkspaceRow = IWorkspaceDoc & { id: string };

const SEAT_RATE: Record<string, number> = {
  standard: 79,
  business: 149,
  trial: 0,
};

function estimatedMrr(row: TWorkspaceRow): string {
  const rate = SEAT_RATE[row.plan] ?? 0;
  return `RM ${(rate * row.seatLimit).toLocaleString()}`;
}

function formatDate(value: Date | Timestamp | undefined): string {
  if (value === undefined) return '—';
  const date = value instanceof Timestamp ? value.toDate() : value;
  return date.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Workspace list page — live Firestore subscription ordered by createdAt DESC. */
export function WorkspaceListPage() {
  const [workspaces, setWorkspaces] = useState<TWorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'workspaces'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setWorkspaces(snap.docs.map((d) => {
          const raw = d.data() as Omit<IWorkspaceDoc, 'id'> & { id?: string };
          return { ...raw, id: d.id };
        }));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, []);

  return (
    <>
      <SkipLink />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workspaces</h1>
        <Link
          to="/workspaces/new"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Provision new
        </Link>
      </div>

      {loading && (
        <p role="status" aria-live="polite" className="mt-6 text-center text-sm text-muted-foreground">
          Loading workspaces…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && error === null && workspaces.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No workspaces yet.</p>
      )}

      {workspaces.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm" aria-label="Workspace list">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Slug</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Seats</th>
                <th className="py-2 pr-4 font-medium">Est. MRR</th>
                <th className="py-2 pr-4 font-medium">Expires</th>
                <th className="py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((ws) => (
                <tr key={ws.id} className="border-b hover:bg-muted/40">
                  <td className="py-2 pr-4 font-medium">
                    <Link to={`/workspaces/${ws.id}`} className="hover:underline">
                      {ws.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{ws.slug}</td>
                  <td className="py-2 pr-4 capitalize">{ws.plan}</td>
                  <td className="py-2 pr-4">
                    {ws.seatsUsed} / {ws.seatLimit}
                  </td>
                  <td className="py-2 pr-4">{estimatedMrr(ws)}</td>
                  <td className="py-2 pr-4">{formatDate(ws.planExpiresAt as unknown as Timestamp)}</td>
                  {/* lastActivityAt: deferred to #17 trigger — show — until then */}
                  <td className="py-2 text-muted-foreground">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
