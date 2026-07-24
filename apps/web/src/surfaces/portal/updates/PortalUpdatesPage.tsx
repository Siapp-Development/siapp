import { updateLabel, usePortalUpdates } from './usePortalUpdates.ts';
import { usePortalSessionContext } from '../usePortalSession.ts';

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Portal updates feed (B4, #21): client-safe activity entries newest-first
 * with a Load-more that widens the live subscription. B4x: friendly empty
 * state instead of a bare list.
 */
export function PortalUpdatesPage() {
  const session = usePortalSessionContext();
  const { state, loadMore } = usePortalUpdates(session.workspaceId, session.projectId);

  if (state.status === 'loading') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading updates&hellip;
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-destructive">
        We couldn&rsquo;t load updates right now. Please try again shortly.
      </p>
    );
  }

  return (
    <section aria-labelledby="updates-page-heading">
      <h1 id="updates-page-heading" className="text-2xl font-bold">
        Updates
      </h1>
      {state.rows.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No updates yet — you&rsquo;ll see progress here as your project team works.
        </p>
      ) : (
        <>
          <ul aria-label="Project updates" className="mt-4 space-y-3">
            {state.rows.map((update) => (
              <li key={update.id} className="rounded-lg border border-border p-3">
                <p className="text-sm">{updateLabel(update)}</p>
                {update.at !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {DATE_TIME_FORMAT.format(update.at)}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {state.hasMore && (
            <button
              type="button"
              onClick={loadMore}
              className="mt-4 w-full rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Load more
            </button>
          )}
        </>
      )}
    </section>
  );
}
