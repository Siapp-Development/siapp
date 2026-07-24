/**
 * Firm home / dashboard (#17, wireframe A0): action-oriented — personal task
 * buckets plus a "needs your attention" project table. The full project
 * inventory lives on the Projects page (A2). Presentational only: all data
 * arrives via useProjects + useDashboardTasks; this page performs no writes.
 */

import { Button, cn } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import { LifecycleBadge } from '../projects/LifecycleBadge.tsx';
import { TASK_STATUS_LABELS } from '../projects/tasks/taskLabels.ts';
import { useProjects } from '../projects/useProjects.ts';
import { bucketTasks } from './dueBuckets.ts';
import { HealthBadge } from './HealthBadge.tsx';
import { attentionRank, needsAttention } from './projectHealth.ts';
import { useDashboardTasks, type IDashboardTaskRow } from './useDashboardTasks.ts';

type TBucketId = 'myOpen' | 'overdue' | 'dueThisWeek';

const BUCKETS: ReadonlyArray<{ id: TBucketId; label: string; empty: string }> = [
  { id: 'myOpen', label: 'My tasks', empty: 'No other open tasks assigned to you.' },
  { id: 'overdue', label: 'Overdue', empty: 'Nothing overdue. Nice work.' },
  { id: 'dueThisWeek', label: 'Due this week', empty: 'Nothing due in the next 7 days.' },
];

interface ITaskListItemProps {
  task: IDashboardTaskRow;
  workspaceSlug: string;
}

function TaskListItem({ task, workspaceSlug }: ITaskListItemProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-4 py-3">
      <span className="flex flex-col">
        <span className="font-medium">{task.title}</span>
        <Link
          to={`/${workspaceSlug}/projects/${task.projectId}`}
          className="text-sm text-muted-foreground hover:text-primary"
        >
          {task.projectName}
        </Link>
      </span>
      <span className="text-sm text-muted-foreground">
        {TASK_STATUS_LABELS[task.status]}
        {task.dueDate !== null && ` · due ${task.dueDate.toLocaleDateString()}`}
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

  const canCreate = role === 'owner' || role === 'admin' || role === 'pm';
  const buckets = bucketTasks(
    tasks.status === 'ready' ? tasks.rows : [],
    uid,
    new Date(),
  );
  const attention = projectRows
    .filter((p) => p.lifecycle === 'draft' || p.lifecycle === 'published')
    .filter(needsAttention)
    .sort((a, b) => attentionRank(a) - attentionRank(b) || a.name.localeCompare(b.name));

  const loading = projects.status === 'loading' || tasks.status === 'loading';
  const errored = projects.status === 'error' || tasks.status === 'error';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Home</h1>
          <p className="mt-1 text-sm text-muted-foreground">{workspaceName}</p>
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
            <div role="tablist" aria-label="Task buckets" className="flex flex-wrap gap-2">
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
                    'min-w-36 rounded-md border px-4 py-3 text-left',
                    bucket === entry.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  <span className="block text-2xl font-bold">{buckets[entry.id].length}</span>
                  <span className="block text-sm text-muted-foreground">{entry.label}</span>
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="dashboard-task-panel"
              aria-labelledby={`dashboard-tab-${bucket}`}
            >
              {buckets[bucket].length === 0 ? (
                <p className="text-sm">{BUCKETS.find((b) => b.id === bucket)?.empty}</p>
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
              <p className="text-sm">All projects are on track.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {attention.map((project) => (
                  <li
                    key={project.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-4 py-3"
                  >
                    <span className="flex items-center gap-2">
                      <Link
                        to={`/${workspaceSlug}/projects/${project.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {project.name}
                      </Link>
                      <LifecycleBadge lifecycle={project.lifecycle} />
                      <HealthBadge project={project} />
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {project.progressPct}% complete
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
