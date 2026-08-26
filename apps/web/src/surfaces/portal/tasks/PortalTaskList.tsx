/**
 * Read-only, phase-grouped task list for the portal (#126, D-042). Each row
 * shows a text status chip (never color-only) and dates. No task-detail
 * drill-in, no editing — this is the accessible equivalent of the timeline.
 */

import { Badge, type IBadgeProps } from '@siapp/ui';

import type { IPortalTaskGroup } from './usePortalTasks.ts';
import { PORTAL_STATUS_LABELS, derivePortalStatus, type TPortalTaskStatus } from './portalTaskStatus.ts';

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const STATUS_VARIANTS: Record<TPortalTaskStatus, IBadgeProps['variant']> = {
  done: 'success',
  overdue: 'danger',
  blocked: 'warning',
  in_progress: 'primary',
  todo: 'neutral',
};

function formatDate(date: Date | null): string | null {
  return date === null ? null : DATE_FORMAT.format(date);
}

function dateRange(start: Date | null, due: Date | null): string | null {
  const startLabel = formatDate(start);
  const dueLabel = formatDate(due);
  if (startLabel !== null && dueLabel !== null) {
    return `${startLabel} – ${dueLabel}`;
  }
  if (dueLabel !== null) {
    return `Due ${dueLabel}`;
  }
  if (startLabel !== null) {
    return `From ${startLabel}`;
  }
  return null;
}

export interface IPortalTaskListProps {
  groups: readonly IPortalTaskGroup[];
  /** Injected for deterministic overdue derivation. */
  now?: Date;
}

export function PortalTaskList({ groups, now = new Date() }: IPortalTaskListProps) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks to show yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.phaseId ?? '__unphased__'} aria-label={group.name}>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group.name}
          </h3>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {group.tasks.map((task) => {
              const status = derivePortalStatus(task, now);
              const range = dateRange(task.startDate, task.dueDate);
              return (
                <li key={task.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    {range !== null && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{range}</p>
                    )}
                  </div>
                  <Badge variant={STATUS_VARIANTS[status]} className="shrink-0">
                    {PORTAL_STATUS_LABELS[status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
