import { Progress } from '@siapp/ui';
import { Link } from 'react-router';

import { TimespanBar } from './TimespanBar.tsx';
import { updateLabel, usePortalUpdates } from './updates/usePortalUpdates.ts';
import { currentPhase, nextMilestone, usePortalProject } from './usePortalProject.ts';
import { usePortalSessionContext } from './usePortalSession.ts';

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });

function formatDate(date: Date | null): string {
  return date === null ? '—' : DATE_FORMAT.format(date);
}

/**
 * Portal overview (B2, #21): dates row, elapsed timespan, progress (D5 —
 * server-maintained progressPct), current phase, next milestone, a 3-entry
 * updates preview and a documents link. B2x: dashed placeholders when the
 * firm hasn't structured the project yet.
 */
export function PortalProjectPage() {
  const session = usePortalSessionContext();
  const state = usePortalProject(session.workspaceId, session.projectId);
  const { state: updatesState } = usePortalUpdates(session.workspaceId, session.projectId, 3);

  if (state.status === 'loading') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading your project&hellip;
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-destructive">
        We couldn&rsquo;t load your project right now. Please try again shortly.
      </p>
    );
  }

  const { project, phases, milestones } = state;
  const phase = currentPhase(phases);
  const milestone = nextMilestone(milestones);

  return (
    <div className="space-y-6">
      <section aria-labelledby="overview-heading">
        <h1 id="overview-heading" className="text-3xl font-bold tracking-tight">
          {project.name}
        </h1>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Started</dt>
            <dd className="mt-0.5 font-medium">{formatDate(project.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">
              Target completion
            </dt>
            <dd className="mt-0.5 font-medium">{formatDate(project.targetEndDate)}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <TimespanBar startDate={project.startDate} targetEndDate={project.targetEndDate} />
        </div>
      </section>

      <section
        aria-labelledby="progress-heading"
        className="rounded-lg border border-border bg-card p-4 shadow-card"
      >
        <h2 id="progress-heading" className="text-sm font-semibold">
          Progress
        </h2>
        <div className="mt-3 flex items-center gap-3">
          <Progress
            value={project.progressPct}
            label="Project progress"
            className="h-2 flex-1"
            indicatorClassName="bg-accent"
          />
          <span className="font-display text-lg font-bold tabular-nums">
            {project.progressPct}%
          </span>
        </div>
        {phase !== null ? (
          <p className="mt-3 text-sm">
            <span className="text-muted-foreground">Current phase:</span>{' '}
            <span className="font-medium">{phase.name}</span>
          </p>
        ) : (
          <p className="mt-3 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            Your project team is still setting up the timeline.
          </p>
        )}
      </section>

      <section
        aria-labelledby="milestone-heading"
        className="rounded-lg border border-border bg-card p-4 shadow-card"
      >
        <h2 id="milestone-heading" className="text-sm font-semibold">
          Next milestone
        </h2>
        {milestone !== null ? (
          <p className="mt-2 text-sm">
            <span className="font-medium">{milestone.name}</span>
            <span className="text-muted-foreground"> — {formatDate(milestone.targetDate)}</span>
          </p>
        ) : (
          <p className="mt-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            No upcoming milestones yet.
          </p>
        )}
      </section>

      <section
        aria-labelledby="updates-heading"
        className="rounded-lg border border-border bg-card p-4 shadow-card"
      >
        <div className="flex items-baseline justify-between">
          <h2 id="updates-heading" className="text-sm font-semibold">
            Recent updates
          </h2>
          <Link to="updates" className="text-sm text-primary underline-offset-2 hover:underline">
            See all
          </Link>
        </div>
        {updatesState.status === 'ready' && updatesState.rows.length > 0 ? (
          <ul className="mt-2 space-y-2 text-sm">
            {updatesState.rows.map((update) => (
              <li key={update.id}>{updateLabel(update)}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No updates yet.</p>
        )}
      </section>

      <Link
        to="documents"
        className="block rounded-lg border border-border bg-card p-4 text-sm font-medium shadow-card transition-colors duration-150 hover:border-accent/50 hover:bg-muted"
      >
        View and share documents →
      </Link>
    </div>
  );
}
