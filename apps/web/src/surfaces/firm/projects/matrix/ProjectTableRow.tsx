/**
 * One project block for the Projects Table view (#166). The project is rendered
 * as its OWN semantic `<table>` whose columns are THAT project's phases (ordered
 * by `phase.order`), each column split into a phase-name band (`<thead>`) over a
 * tasks band (`<tbody>`). A trailing "No phase" column appears only when the
 * project has tasks without a resolvable phase.
 *
 * Data: phases come from the parent's `useAllProjectsPhases` fan-out; tasks come
 * from the existing `useTasks(workspaceId, projectId, role, departments)` hook
 * UNCHANGED — so owner/admin see the raw list while pm/viewer get the
 * department fan-out plus dimmed restricted-header rows. We never read tasks a
 * role cannot see; restricted tasks surface only as a muted "Restricted (N
 * hidden)" entry.
 */

import { cn } from '@siapp/ui';
import { Lock } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { TMemberRole } from '@siapp/shared';

import { LifecycleBadge } from '../LifecycleBadge.tsx';
import type { IProjectRow } from '../useProjects.ts';
import { TaskStatusRing } from '../tasks/TaskStatusRing.tsx';
import { useTasks, type IPhaseRow, type TTaskListRow } from '../tasks/useTasks.ts';
import { buildProjectPhaseColumns, groupTasksByPhase } from './projectsMatrix.ts';

interface IProjectTableRowProps {
  workspaceId: string;
  workspaceSlug: string;
  project: IProjectRow;
  phases: readonly IPhaseRow[];
  role: TMemberRole;
  departments: string[];
}

/** Contents of a single phase's tasks band (cell). */
function PhaseTasksCell({ rows }: { rows: readonly TTaskListRow[] }) {
  const visibleTasks = rows.filter((row) => !row.restricted);
  const restrictedCount = rows.length - visibleTasks.length;

  if (rows.length === 0) {
    return <span className="sr-only">No tasks</span>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {visibleTasks.map((task) => (
        <li key={task.id} className="flex items-center gap-1.5 text-sm">
          <TaskStatusRing status={task.status} />
          <span className="truncate" title={task.title}>
            {task.title}
          </span>
        </li>
      ))}
      {restrictedCount > 0 && (
        <li className="flex items-center gap-1.5 text-sm text-muted-foreground/70 italic">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Restricted ({restrictedCount} hidden)</span>
        </li>
      )}
    </ul>
  );
}

export function ProjectTableRow({
  workspaceId,
  workspaceSlug,
  project,
  phases,
  role,
  departments,
}: IProjectTableRowProps) {
  const tasks = useTasks(workspaceId, project.id, role, departments);

  const taskRows = useMemo(
    () => (tasks.status === 'ready' ? tasks.rows : []),
    [tasks],
  );
  const knownPhaseIds = useMemo(() => new Set(phases.map((p) => p.id)), [phases]);
  const columns = useMemo(
    () => buildProjectPhaseColumns(phases, taskRows),
    [phases, taskRows],
  );
  const grouped = useMemo(
    () => groupTasksByPhase(taskRows, knownPhaseIds),
    [taskRows, knownPhaseIds],
  );

  const heading = (
    <span className="flex flex-wrap items-center gap-2">
      <Link
        to={`/${workspaceSlug}/projects/${project.id}`}
        className={cn(
          'font-semibold text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline',
          'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none',
        )}
      >
        {project.name}
      </Link>
      <LifecycleBadge lifecycle={project.lifecycle} />
    </span>
  );

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div
        data-print-region
        role="region"
        aria-label={`${project.name} phases`}
        tabIndex={0}
        className="overflow-x-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <table className="w-full border-collapse text-left">
          <caption className="mb-2 text-left">{heading}</caption>

          {tasks.status === 'loading' && (
            <tbody>
              <tr>
                <td className="py-2 text-sm text-muted-foreground">Loading tasks…</td>
              </tr>
            </tbody>
          )}

          {tasks.status === 'error' && (
            <tbody>
              <tr>
                <td className="py-2 text-sm text-danger">Tasks could not be loaded.</td>
              </tr>
            </tbody>
          )}

          {tasks.status === 'ready' && columns.length === 0 && (
            <tbody>
              <tr>
                <td className="py-2 text-sm text-muted-foreground">No phases yet.</td>
              </tr>
            </tbody>
          )}

          {tasks.status === 'ready' && columns.length > 0 && (
            <>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.phaseId ?? '__no_phase__'}
                      scope="col"
                      className="min-w-[10rem] max-w-[14rem] border-b border-border pr-4 pb-1.5 align-top text-sm font-semibold text-foreground"
                    >
                      <span className="block truncate" title={column.name}>
                        {column.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {columns.map((column) => (
                    <td
                      key={column.phaseId ?? '__no_phase__'}
                      className="min-w-[10rem] max-w-[14rem] pt-2 pr-4 align-top"
                    >
                      <PhaseTasksCell rows={grouped.get(column.phaseId) ?? []} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </>
          )}
        </table>
      </div>
    </section>
  );
}
