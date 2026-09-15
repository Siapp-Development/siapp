/**
 * Projects Table view (#166): a stack of per-project blocks, each its own
 * semantic `<table>` of THAT project's phases (see `ProjectTableRow`). Phases
 * for every visible project load through one bounded fan-out
 * (`useAllProjectsPhases`); tasks load per block.
 *
 * Bounded listeners: the table renders at most `PROJECT_TABLE_CAP` projects. When
 * the filtered set is larger, it shows the first `PROJECT_TABLE_CAP` and a
 * "narrow your filters" notice instead of mounting dozens of live subscriptions.
 */

import { useMemo } from 'react';
import type { TMemberRole } from '@siapp/shared';

import type { IProjectRow } from '../useProjects.ts';
import { ProjectTableRow } from './ProjectTableRow.tsx';
import { useAllProjectsPhases } from './useAllProjectsPhases.ts';

/** Bound on the number of live task/phase subscriptions the Table mounts. */
export const PROJECT_TABLE_CAP = 25;

interface IProjectsTableViewProps {
  workspaceId: string;
  workspaceSlug: string;
  projects: readonly IProjectRow[];
  role: TMemberRole;
  departments: string[];
}

export function ProjectsTableView({
  workspaceId,
  workspaceSlug,
  projects,
  role,
  departments,
}: IProjectsTableViewProps) {
  const overCap = projects.length > PROJECT_TABLE_CAP;
  const capped = useMemo(() => projects.slice(0, PROJECT_TABLE_CAP), [projects]);
  const projectIds = useMemo(() => capped.map((project) => project.id), [capped]);
  const phases = useAllProjectsPhases(workspaceId, projectIds);

  if (projects.length === 0) {
    return <p className="text-sm">No projects match your filters.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {overCap && (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
        >
          Showing the first {PROJECT_TABLE_CAP} of {projects.length} projects. Narrow your filters
          to see the rest as a table.
        </p>
      )}

      {phases.status === 'loading' && <p className="text-sm text-muted-foreground">Loading phases…</p>}
      {phases.status === 'error' && (
        <p className="text-sm text-danger">Phases could not be loaded.</p>
      )}
      {phases.status === 'ready' && (
        <div className="flex flex-col gap-4">
          {capped.map((project) => (
            <ProjectTableRow
              key={project.id}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
              project={project}
              phases={phases.phasesByProject.get(project.id) ?? []}
              role={role}
              departments={departments}
            />
          ))}
        </div>
      )}
    </div>
  );
}
