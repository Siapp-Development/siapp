/**
 * Clickable task card for the #102 Home page. Fixes the core bug where only the
 * project subtitle was a link: the whole card now deep-links into the project's
 * Tasks tab via `?task=` (the scroll/highlight/drawer machinery in
 * TasksSection/ProjectDetailPage is reused by URL — nothing here reimplements
 * it). Uses the "stretched primary link + layered secondary link" pattern so
 * the project name stays independently clickable without nesting <a> in <a>
 * (invalid HTML that breaks assistive tech).
 */

import { Badge } from '@siapp/ui';
import { Link } from 'react-router';

import { TaskStatusBadge } from '../projects/tasks/TaskStatusBadge.tsx';
import { ChevronRightIcon } from './dashboardIcons.tsx';
import { relativeDueDate, type TDueTone } from './relativeDueDate.ts';
import type { IDashboardTaskRow } from './useDashboardTasks.ts';

const DUE_TONE_VARIANT: Record<TDueTone, 'danger' | 'warning' | 'neutral'> = {
  danger: 'danger',
  warning: 'warning',
  muted: 'neutral',
};

/** Up to two leading letters from an assignee name for the initials chip. */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

interface IDashboardTaskCardProps {
  task: IDashboardTaskRow;
  workspaceSlug: string;
  now: Date;
}

export function DashboardTaskCard({ task, workspaceSlug, now }: IDashboardTaskCardProps) {
  const due = relativeDueDate(task.dueDate, now);
  const [firstAssignee, ...restAssignees] = task.assignees;
  const overflow = restAssignees.length;

  return (
    <li className="group relative flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-card transition-colors duration-150 hover:border-primary/50 hover:shadow-raised focus-within:ring-2 focus-within:ring-primary">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Primary target: stretched overlay makes the whole card open the task. */}
        <Link
          to={`/${workspaceSlug}/projects/${task.projectId}?task=${task.id}`}
          aria-label={`Open task ${task.title} in ${task.projectName}`}
          className="truncate font-medium before:absolute before:inset-0 before:content-[''] group-hover:text-primary focus-visible:outline-none"
        >
          {task.title}
        </Link>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <TaskStatusBadge status={task.status} />
          {/* Secondary target: layered above the overlay so it stays clickable. */}
          <Link
            to={`/${workspaceSlug}/projects/${task.projectId}`}
            className="relative z-10 truncate hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            {task.projectName}
          </Link>
          {task.dueDate !== null && (
            <Badge variant={DUE_TONE_VARIANT[due.tone]}>{due.label}</Badge>
          )}
        </div>
      </div>

      {firstAssignee !== undefined && (
        <span className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
          >
            {initials(firstAssignee.name)}
          </span>
          <span className="hidden max-w-32 truncate text-sm text-muted-foreground sm:inline">
            {firstAssignee.name}
            {overflow > 0 && <span className="ml-1 font-medium">+{overflow}</span>}
          </span>
        </span>
      )}

      <ChevronRightIcon className="shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" />
    </li>
  );
}
