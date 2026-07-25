import { Badge } from '@siapp/ui';

import type { IProjectRow } from '../projects/useProjects.ts';
import { projectHealth, type TProjectHealth } from './projectHealth.ts';

const HEALTH_VARIANTS: Record<TProjectHealth, 'danger' | 'warning' | 'success'> = {
  overdue: 'danger',
  blocked: 'warning',
  on_track: 'success',
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
    <Badge variant={HEALTH_VARIANTS[health]} className="border border-current/20">
      {healthLabel(health, project)}
    </Badge>
  );
}
