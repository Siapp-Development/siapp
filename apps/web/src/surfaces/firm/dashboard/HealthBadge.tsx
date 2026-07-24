import type { IProjectRow } from '../projects/useProjects.ts';
import { projectHealth, type TProjectHealth } from './projectHealth.ts';

const HEALTH_BADGE_CLASSES: Record<TProjectHealth, string> = {
  overdue: 'bg-destructive/10 text-destructive',
  blocked: 'bg-amber-100 text-amber-800',
  on_track: 'bg-emerald-100 text-emerald-800',
};

function healthLabel(health: TProjectHealth, project: IProjectRow): string {
  if (health === 'overdue') {
    return `${project.overdueTasks} overdue`;
  }
  if (health === 'blocked') {
    return `${project.blockedTasks} blocked`;
  }
  return 'On track';
}

/**
 * Aggregate health chip for a project row (D4/D7 — counts only, visible to
 * every member). Text + color, never color alone; visually distinct from
 * `LifecycleBadge` (border marks it as a health chip, not a lifecycle state).
 */
export function HealthBadge({ project }: { project: IProjectRow }) {
  const health = projectHealth(project);
  return (
    <span
      className={`rounded-full border border-current/20 px-2 py-0.5 text-xs font-medium ${HEALTH_BADGE_CLASSES[health]}`}
    >
      {healthLabel(health, project)}
    </span>
  );
}
