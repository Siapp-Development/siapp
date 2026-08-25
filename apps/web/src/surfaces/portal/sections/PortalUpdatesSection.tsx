/**
 * Recent Updates section (#126, D-042): an inline preview of the client-safe
 * activity feed. Reuses usePortalUpdates + updateLabel unchanged; the old
 * standalone /updates page is replaced by this section on the single screen.
 */

import { updateLabel, usePortalUpdates } from '../updates/usePortalUpdates.ts';
import { useId } from 'react';

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const PREVIEW_COUNT = 5;

export interface IPortalUpdatesSectionProps {
  workspaceId: string;
  projectId: string;
}

export function PortalUpdatesSection({ workspaceId, projectId }: IPortalUpdatesSectionProps) {
  const { state } = usePortalUpdates(workspaceId, projectId, PREVIEW_COUNT);
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border bg-card p-4 shadow-card"
    >
      <h2 id={headingId} className="text-sm font-semibold">
        Recent updates
      </h2>
      {state.status === 'loading' && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Loading updates&hellip;
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          We couldn&rsquo;t load updates right now. Please try again shortly.
        </p>
      )}
      {state.status === 'ready' &&
        (state.rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No updates yet — you&rsquo;ll see progress here as your project team works.
          </p>
        ) : (
          <ul aria-label="Recent updates" className="mt-2 space-y-2 text-sm">
            {state.rows.map((update) => (
              <li key={update.id}>
                <p>{updateLabel(update)}</p>
                {update.at !== null && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {DATE_FORMAT.format(update.at)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
