/**
 * One project block for the Projects Table view (#166). The project is rendered
 * as its OWN semantic `<table>` whose columns are THAT project's phases (ordered
 * by `phase.order`), each column split into a phase-name band (`<thead>`) over a
 * tasks band (`<tbody>`). A trailing "No phase" column appears only when the
 * project has tasks without a resolvable phase.
 *
 * Data: each block loads its OWN phases via `usePhases(workspaceId, projectId)`
 * and its tasks via `useTasks(workspaceId, projectId, role, departments)` —
 * UNCHANGED — so owner/admin see the raw list while pm/viewer get the
 * department fan-out plus dimmed restricted-header rows. Because both listeners
 * are scoped to this block, one slow/failed project never blocks the others. We
 * never read tasks a role cannot see; restricted tasks surface only as a muted
 * "Restricted (N hidden)" entry.
 */

import { cn } from '@siapp/ui';
import { Lock } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { TMemberRole } from '@siapp/shared';

import { LifecycleBadge } from '../LifecycleBadge.tsx';
import { clientSummaryLabel } from '../projectLabels.ts';
import type { IProjectRow } from '../useProjects.ts';
import { TaskStatusRing } from '../tasks/TaskStatusRing.tsx';
import { usePhases, useTasks, type TTaskListRow } from '../tasks/useTasks.ts';
import { buildProjectPhaseColumns, groupTasksByPhase } from './projectsMatrix.ts';

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Plain-text (screen-reader friendly) start → target-end range for a project
 * block header. Handles every null combination gracefully. Non-exported to keep
 * this module's only export the component (react-refresh/only-export-components).
 */
function formatProjectDateRange(start: Date | null, end: Date | null): string {
  if (start && end) {
    return `${DATE_FMT.format(start)} → ${DATE_FMT.format(end)}`;
  }
  if (start) {
    return `From ${DATE_FMT.format(start)}`;
  }
  if (end) {
    return `Due ${DATE_FMT.format(end)}`;
  }
  return 'No dates set';
}

interface IProjectTableRowProps {
  workspaceId: string;
  workspaceSlug: string;
  project: IProjectRow;
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
          <span className="min-w-0 truncate" title={task.title}>
            {task.title}
          </span>
        </li>
      ))}
      {restrictedCount > 0 && (
        <li className="flex items-center gap-1.5 text-sm text-muted-foreground italic">
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
  role,
  departments,
}: IProjectTableRowProps) {
  const phasesState = usePhases(workspaceId, project.id);
  const tasks = useTasks(workspaceId, project.id, role, departments);

  // Combined block state: this project's phases AND tasks load independently of
  // every other block. Error wins over loading so a failed listener surfaces a
  // scoped message rather than an endless skeleton.
  const blockStatus: 'loading' | 'error' | 'ready' =
    phasesState.status === 'error' || tasks.status === 'error'
      ? 'error'
      : phasesState.status === 'loading' || tasks.status === 'loading'
        ? 'loading'
        : 'ready';

  const phaseRows = useMemo(
    () => (phasesState.status === 'ready' ? phasesState.rows : []),
    [phasesState],
  );
  const taskRows = useMemo(
    () => (tasks.status === 'ready' ? tasks.rows : []),
    [tasks],
  );
  const knownPhaseIds = useMemo(() => new Set(phaseRows.map((p) => p.id)), [phaseRows]);
  const columns = useMemo(
    () => buildProjectPhaseColumns(phaseRows, taskRows),
    [phaseRows, taskRows],
  );
  const grouped = useMemo(
    () => groupTasksByPhase(taskRows, knownPhaseIds),
    [taskRows, knownPhaseIds],
  );

  const heading = (
    <span className="flex flex-col gap-0.5">
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
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span>{clientSummaryLabel(project.clients) || 'No client'}</span>
        <span aria-hidden="true">·</span>
        <span>{formatProjectDateRange(project.startDate, project.targetEndDate)}</span>
      </span>
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

          {blockStatus === 'loading' && (
            <tbody>
              <tr>
                <td className="py-2 text-sm text-muted-foreground">Loading…</td>
              </tr>
            </tbody>
          )}

          {blockStatus === 'error' && (
            <tbody>
              <tr>
                <td className="py-2 text-sm text-danger">
                  This project&rsquo;s phases/tasks could not be loaded.
                </td>
              </tr>
            </tbody>
          )}

          {blockStatus === 'ready' && columns.length === 0 && (
            <tbody>
              <tr>
                <td className="py-2 text-sm text-muted-foreground">No phases yet.</td>
              </tr>
            </tbody>
          )}

          {blockStatus === 'ready' && columns.length > 0 && (
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
