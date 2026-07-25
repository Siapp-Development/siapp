/**
 * Read-only project activity timeline (#23, D9): server-derived entries
 * grouped by day, newest first. No composer, no edit/delete affordances.
 * Draft-suppressed notifications carry the D-027 "would have notified" badge.
 */

import { Alert, Button, Card, CardContent, cn } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';

import { WOULD_HAVE_NOTIFIED_BADGE, activityLine } from './activityLabels.ts';
import { useProjectActivity, type IActivityRow } from './useProjectActivity.ts';

export interface IActivitySectionProps {
  workspaceId: string;
  projectId: string;
  role: TMemberRole;
  departments: string[];
}

/** Day bucket key, e.g. "Mon, 3 Feb 2026"; "Just now" for pending stamps. */
function dayLabel(at: Date | null): string {
  return at === null
    ? 'Just now'
    : at.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

function timeLabel(at: Date | null): string {
  return at === null ? '' : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface IDayGroup {
  label: string;
  rows: IActivityRow[];
}

/** Groups already-sorted (newest-first) rows into day buckets; exported for tests. */
export function groupByDay(rows: IActivityRow[]): IDayGroup[] {
  const groups: IDayGroup[] = [];
  for (const row of rows) {
    const label = dayLabel(row.at);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.label === label) {
      last.rows.push(row);
    } else {
      groups.push({ label, rows: [row] });
    }
  }
  return groups;
}

function ActivityEntry({ row }: { row: IActivityRow }) {
  const line = activityLine(row);
  return (
    <li className="flex items-baseline gap-2 py-2 text-sm">
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {timeLabel(row.at)}
      </span>
      <span>
        <span className="font-medium">{line.actor}</span> {line.text}
        {line.subject !== null && (
          <>
            {' '}
            <span className={cn('font-medium', line.subjectStruck && 'line-through')}>
              {line.subject}
            </span>
          </>
        )}
        {line.detail !== '' && <> {line.detail}</>}
        {row.wouldHaveNotified && (
          <span className="ml-2 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
            {WOULD_HAVE_NOTIFIED_BADGE}
          </span>
        )}
      </span>
    </li>
  );
}

export function ActivitySection({
  workspaceId,
  projectId,
  role,
  departments,
}: IActivitySectionProps) {
  const state = useProjectActivity(workspaceId, projectId, role, departments);

  if (state.status === 'loading') {
    return <p className="text-sm">Loading activity…</p>;
  }
  if (state.status === 'error') {
    return <Alert variant="destructive">The activity timeline could not be loaded.</Alert>;
  }
  if (state.rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No activity yet — changes to tasks, documents and the project will show up here.
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-label="Project activity" className="flex flex-col gap-4">
      {groupByDay(state.rows).map((group) => (
        <div key={group.label}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </h3>
          <ul className="mt-1 divide-y">
            {group.rows.map((row) => (
              <ActivityEntry key={row.id} row={row} />
            ))}
          </ul>
        </div>
      ))}
      {state.hasMore && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state.loadingMore}
            onClick={state.loadMore}
          >
            {state.loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </section>
  );
}
