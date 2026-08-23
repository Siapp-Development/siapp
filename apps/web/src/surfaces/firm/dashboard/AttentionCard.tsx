/**
 * Clickable "needs your attention" project card for the #102 Home page. The
 * whole card is a single <Link> to the project root (one anchor, no nesting):
 * the badges, progress bar and metric line are non-interactive children, so no
 * z-layering is needed here (unlike the task card, which has two targets).
 */

import { Progress } from '@siapp/ui';
import { Link } from 'react-router';

import { LifecycleBadge } from '../projects/LifecycleBadge.tsx';
import type { IProjectRow } from '../projects/useProjects.ts';
import { ChevronRightIcon } from './dashboardIcons.tsx';
import { HealthBadge } from './HealthBadge.tsx';
import { projectHealth } from './projectHealth.ts';

const HEALTH_LABEL: Record<ReturnType<typeof projectHealth>, string> = {
  overdue: 'overdue',
  blocked: 'blocked',
  on_track: 'on track',
};

/** Mini metric line, e.g. "2 overdue · 1 blocked"; segments at 0 are omitted. */
function metricSegments(project: IProjectRow): string[] {
  const segments: string[] = [];
  if (project.overdueTasks > 0) {
    segments.push(`${project.overdueTasks} overdue`);
  }
  if (project.blockedTasks > 0) {
    segments.push(`${project.blockedTasks} blocked`);
  }
  return segments;
}

interface IAttentionCardProps {
  project: IProjectRow;
  workspaceSlug: string;
}

export function AttentionCard({ project, workspaceSlug }: IAttentionCardProps) {
  const metrics = metricSegments(project);

  return (
    <li>
      <Link
        to={`/${workspaceSlug}/projects/${project.id}`}
        aria-label={`${project.name} — ${HEALTH_LABEL[projectHealth(project)]}`}
        className="group flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-card transition-colors duration-150 hover:border-primary/50 hover:shadow-raised focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-medium text-foreground group-hover:text-primary">
              {project.name}
            </span>
            <LifecycleBadge lifecycle={project.lifecycle} />
            <HealthBadge project={project} />
          </span>
          <ChevronRightIcon className="mt-0.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>

        {(project.clientNameDenorm !== '' || metrics.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {project.clientNameDenorm !== '' && <span className="truncate">{project.clientNameDenorm}</span>}
            {project.clientNameDenorm !== '' && metrics.length > 0 && (
              <span aria-hidden="true">·</span>
            )}
            {metrics.length > 0 && <span>{metrics.join(' · ')}</span>}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Progress</span>
          <Progress
            value={project.progressPct}
            label={`${project.name} progress`}
            className="flex-1"
          />
          <span className="text-sm font-medium text-muted-foreground tabular-nums">
            {project.progressPct}%
          </span>
        </div>
      </Link>
    </li>
  );
}
