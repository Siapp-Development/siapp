/**
 * Firm home / dashboard (#17, wireframe A0): action-oriented — personal task
 * buckets plus a "needs your attention" project table. The full project
 * inventory lives on the Projects page (A2). Presentational only: all data
 * arrives via useProjects + useDashboardTasks; this page performs no writes.
 */

import { Button, Progress, cn } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { LifecycleBadge } from '../projects/LifecycleBadge.tsx';
import { TaskStatusBadge } from '../projects/tasks/TaskStatusBadge.tsx';
import { useProjects } from '../projects/useProjects.ts';
import { bucketTasks } from './dueBuckets.ts';
import { HealthBadge } from './HealthBadge.tsx';
import { attentionRank, needsAttention } from './projectHealth.ts';
import { useDashboardTasks, type IDashboardTaskRow } from './useDashboardTasks.ts';

type TBucketId = 'myOpen' | 'overdue' | 'dueThisWeek';

const BUCKETS: ReadonlyArray<{
  id: TBucketId;
  label: string;
  empty: string;
  countClass: string;
}> = [
  {
    id: 'myOpen',
    label: 'My tasks',
    empty: 'No other open tasks assigned to you.',
    countClass: 'text-foreground',
  },
  {
    id: 'overdue',
    label: 'Overdue',
    empty: 'Nothing overdue. Nice work.',
    countClass: 'text-danger',
  },
  {
    id: 'dueThisWeek',
    label: 'Due this week',
    empty: 'Nothing due in the next 7 days.',
    countClass: 'text-warning',
  },
];

interface ITaskListItemProps {
  task: IDashboardTaskRow;
  workspaceSlug: string;
}

function TaskListItem({ task, workspaceSlug }: ITaskListItemProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-card">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{task.title}</span>
        <Link
          to={`/${workspaceSlug}/projects/${task.projectId}`}
          className="truncate text-sm text-muted-foreground hover:text-primary"
        >
          {task.projectName}
        </Link>
      </span>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <TaskStatusBadge status={task.status} />
        {task.dueDate !== null && <span>due {task.dueDate.toLocaleDateString()}</span>}
      </span>
    </li>
  );
}

export interface IDashboardPageProps {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: TMemberRole;
  departments: string[];
  uid: string;
}

export function DashboardPage({
  workspaceId,
  workspaceSlug,
  workspaceName,
  role,
  departments,
  uid,
}: IDashboardPageProps) {
  const projects = useProjects(workspaceId);
  const projectRows = projects.status === 'ready' ? projects.rows : [];
  const tasks = useDashboardTasks(workspaceId, role, departments, projectRows);
  const [bucket, setBucket] = useState<TBucketId>('myOpen');
  // Rolling window (D6): re-bucket once a minute so tasks cross the
  // overdue / due-this-week boundaries without needing an unrelated re-render.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const canCreate = role === 'owner' || role === 'admin' || role === 'pm';
  const buckets = bucketTasks(
    tasks.status === 'ready' ? tasks.rows : [],
    uid,
    now,
  );
  const attention = projectRows
    .filter((p) => p.lifecycle === 'draft' || p.lifecycle === 'published')
    .filter(needsAttention)
    .sort((a, b) => attentionRank(a) - attentionRank(b) || a.name.localeCompare(b.name));

  const loading = projects.status === 'loading' || tasks.status === 'loading';
  const errored = projects.status === 'error' || tasks.status === 'error';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {workspaceName}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Home</h1>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to={`/${workspaceSlug}/projects?new=1`}>New project</Link>
          </Button>
        )}
      </div>

      {loading && <p className="text-sm">Loading your dashboard…</p>}
      {errored && <p className="text-sm">Your dashboard could not be loaded.</p>}

      {!loading && !errored && (
        <>
          <section aria-labelledby="dashboard-tasks-heading" className="flex flex-col gap-3">
            <h2 id="dashboard-tasks-heading" className="text-lg font-semibold">
              Your tasks
            </h2>
            {/* KPI cards double as the bucket tabs (D9). */}
            <div role="tablist" aria-label="Task buckets" className="grid gap-3 sm:grid-cols-3">
              {BUCKETS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  id={`dashboard-tab-${entry.id}`}
                  aria-selected={bucket === entry.id}
                  aria-controls="dashboard-task-panel"
                  onClick={() => setBucket(entry.id)}
                  className={cn(
                    'rounded-lg border bg-card px-4 py-3.5 text-left shadow-card transition-colors duration-150',
                    bucket === entry.id
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  <span
                    className={cn(
                      'block font-display text-3xl font-bold tabular-nums',
                      buckets[entry.id].length > 0 ? entry.countClass : 'text-muted-foreground',
                    )}
                  >
                    {buckets[entry.id].length}
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-muted-foreground">
                    {entry.label}
                  </span>
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="dashboard-task-panel"
              aria-labelledby={`dashboard-tab-${bucket}`}
            >
              {buckets[bucket].length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  {BUCKETS.find((b) => b.id === bucket)?.empty}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {buckets[bucket].map((task) => (
                    <TaskListItem
                      key={`${task.projectId}-${task.id}`}
                      task={task}
                      workspaceSlug={workspaceSlug}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="dashboard-attention-heading" className="flex flex-col gap-3">
            <div>
              <h2 id="dashboard-attention-heading" className="text-lg font-semibold">
                Needs your attention
              </h2>
              <p className="text-sm text-muted-foreground">
                The full inventory is on the{' '}
                <Link
                  to={`/${workspaceSlug}/projects`}
                  className="underline hover:text-primary"
                >
                  Projects
                </Link>{' '}
                page.
              </p>
            </div>
            {attention.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                All projects are on track.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {attention.map((project) => (
                  <li
                    key={project.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 shadow-card"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Link
                        to={`/${workspaceSlug}/projects/${project.id}`}
                        className="truncate font-medium text-foreground hover:text-primary"
                      >
                        {project.name}
                      </Link>
                      <LifecycleBadge lifecycle={project.lifecycle} />
                      <HealthBadge project={project} />
                    </span>
                    <span className="flex w-44 items-center gap-2">
                      <Progress
                        value={project.progressPct}
                        label={`${project.name} progress`}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium text-muted-foreground tabular-nums">
                        {project.progressPct}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
