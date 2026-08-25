/**
 * Collaborator page at siapp.app/t/:token (#127) — lazy-loaded, warm portal
 * theme, mobile-first, submit-only (Q1). Redeems the collaborator-scoped link
 * token, then shows a "My Assigned Tasks" switcher over every task assigned to
 * the collaborator across projects (subject to the same per-task visibility +
 * project-lifecycle gates). Selecting one renders the existing task-detail
 * surface with status actions (D-b), need-help (D-d), notes (D-c) and file
 * exchange (D-f).
 */

import type { TTaskStatus } from '@siapp/shared';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { PrivacyNotice } from '@/components/PrivacyNotice.tsx';
import { SkipLink } from '@/components/SkipLink.tsx';
import { useSurfaceTheme } from '@/hooks/useSurfaceTheme.ts';
import { submitCollabUpdate } from '@/lib/callables.ts';

import {
  CollabErrorState,
  CollabInvalidState,
  CollabLoadingState,
  CollabNotStartedState,
} from './CollabErrorStates.tsx';
import { CollabNotes } from './CollabNotes.tsx';
import { CollabStatusButtons } from './CollabStatusButtons.tsx';
import { CollabUploader } from './CollabUploader.tsx';
import { NeedHelpForm } from './NeedHelpForm.tsx';
import { useCollabAssignedTasks, type IAssignedTaskRow } from './useCollabAssignedTasks.ts';
import {
  CollabSessionProvider,
  useCollabSession,
  type ICollabSession,
} from './useCollabSession.ts';
import {
  useCollabDocuments,
  useCollabTask,
  useCollabUpdates,
  type ICollabTask,
} from './useCollabTask.ts';

const STATUS_LABELS: Record<TTaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Needs help',
  done: 'Done',
};

const DUE_FORMAT = new Intl.DateTimeFormat('en-MY', { dateStyle: 'long' });

const EMPTY_ROWS: readonly IAssignedTaskRow[] = [];

export function CollabTaskPage() {
  const { token } = useParams<'token'>();
  useSurfaceTheme('portal');
  const { state, retry } = useCollabSession(token);

  if (state.status === 'loading') {
    return <CollabLoadingState />;
  }
  if (state.status === 'invalid') {
    return <CollabInvalidState />;
  }
  if (state.status === 'not_started') {
    return <CollabNotStartedState firmName={state.firmName} />;
  }
  if (state.status === 'error') {
    return <CollabErrorState onRetry={retry} />;
  }

  return (
    <CollabSessionProvider value={state.session}>
      <CollabWorkspaceView session={state.session} />
    </CollabSessionProvider>
  );
}

function CollabWorkspaceView({ session }: { session: ICollabSession }) {
  const { workspaceId, collaboratorId, branding } = session;
  const tasksState = useCollabAssignedTasks(workspaceId, collaboratorId);
  const rows = useMemo(
    () => (tasksState.status === 'ready' ? tasksState.rows : EMPTY_ROWS),
    [tasksState],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Keep a valid selection as the list changes: default to the first row,
  // and never leave a selection pointing at a task that dropped out.
  useEffect(() => {
    if (rows.length === 0) {
      if (selectedKey !== null) {
        setSelectedKey(null);
      }
      return;
    }
    if (selectedKey === null || !rows.some((row) => row.key === selectedKey)) {
      setSelectedKey(rows[0].key);
    }
  }, [rows, selectedKey]);

  const selected = useMemo(
    () => rows.find((row) => row.key === selectedKey) ?? null,
    [rows, selectedKey],
  );

  const firmName = branding.firmName !== '' ? branding.firmName : 'Project team';

  return (
    <>
      <SkipLink />
      <header className="border-b border-border bg-card px-6 py-4">
        <p className="text-sm text-muted-foreground">{firmName}</p>
        <h1 className="mt-1 text-xl font-bold">My Assigned Tasks</h1>
      </header>
      <main id="main" className="mx-auto max-w-xl space-y-8 px-6 py-8">
        {tasksState.status === 'loading' && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your tasks&hellip;
          </p>
        )}
        {tasksState.status === 'error' && (
          <p role="alert" className="text-sm text-destructive">
            We couldn&rsquo;t load your tasks. Please refresh to try again.
          </p>
        )}
        {tasksState.status === 'ready' && rows.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            No tasks assigned yet.
          </p>
        )}
        {tasksState.status === 'ready' && rows.length > 0 && (
          <>
            {rows.length > 1 && (
              <TaskSwitcher
                rows={rows}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
              />
            )}
            {selected !== null && (
              <CollabTaskView
                key={selected.key}
                session={session}
                projectId={selected.projectId}
                taskId={selected.taskId}
                projectName={selected.projectName}
              />
            )}
          </>
        )}
      </main>
      <footer className="mx-auto max-w-xl border-t border-border px-6 py-4 text-center">
        {/* #26 D5: static bilingual PDPA notice — the firm is the controller. */}
        <PrivacyNotice firmName={firmName} />
      </footer>
    </>
  );
}

function TaskSwitcher({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: readonly IAssignedTaskRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="collab-task-switcher" className="text-sm font-medium">
        My Assigned Tasks
      </label>
      <select
        id="collab-task-switcher"
        className="h-11 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        value={selectedKey ?? ''}
        onChange={(event) => onSelect(event.target.value)}
      >
        {rows.map((row) => (
          <option key={row.key} value={row.key}>
            {row.title}
            {row.active ? ' (Active)' : ''} — {row.projectName}
          </option>
        ))}
      </select>
    </div>
  );
}

function CollabTaskView({
  session,
  projectId,
  taskId,
  projectName,
}: {
  session: ICollabSession;
  projectId: string;
  taskId: string;
  projectName: string;
}) {
  const { workspaceId, collaboratorId, branding } = session;
  const taskState = useCollabTask(workspaceId, projectId, taskId);
  const updates = useCollabUpdates(workspaceId, projectId, taskId, collaboratorId);
  const collabCanSeeAllAttachments =
    taskState.status === 'ready' ? taskState.task.collaboratorCanSeeAllAttachments : true;
  const documents = useCollabDocuments(
    workspaceId,
    projectId,
    taskId,
    collaboratorId,
    collabCanSeeAllAttachments,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  // Soft revocation mid-session (Q1): rules closed the read path.
  if (taskState.status === 'gone') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        This task is no longer available. Pick another from the list above.
      </p>
    );
  }

  async function submit(
    update: Parameters<typeof submitCollabUpdate>[0]['update'],
  ): Promise<void> {
    setBusy(true);
    setActionError('');
    try {
      await submitCollabUpdate({ projectId, taskId, update });
    } catch {
      setActionError('That didn’t go through. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const task: ICollabTask | null = taskState.status === 'ready' ? taskState.task : null;

  return (
    <section aria-labelledby="collab-task-heading" className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          {branding.firmName !== '' ? branding.firmName : 'Project team'} · {projectName}
        </p>
        <h2 id="collab-task-heading" className="mt-1 text-lg font-bold">
          {task?.title ?? 'Loading task…'}
        </h2>
      </div>

      {task === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading task&hellip;
        </p>
      ) : (
        <>
          <div className="space-y-3">
            <p className="text-sm">
              <span className="rounded-full bg-muted px-3 py-1 font-medium">
                {STATUS_LABELS[task.status]}
              </span>
              {task.dueDate !== null ? (
                <span className="ml-3 text-muted-foreground">
                  Due {DUE_FORMAT.format(task.dueDate)}
                </span>
              ) : null}
            </p>
            {task.status === 'blocked' && task.blockedReason !== '' ? (
              <p className="rounded-md border border-border bg-muted p-3 text-sm">
                Help requested: {task.blockedReason}
              </p>
            ) : null}
            {task.description !== '' ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {task.description}
              </p>
            ) : null}
          </div>

          <div aria-labelledby="collab-actions-heading" className="space-y-4">
            <h3 id="collab-actions-heading" className="sr-only">
              Update status
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <CollabStatusButtons
                status={task.status}
                busy={busy}
                onStart={() => void submit({ kind: 'status', to: 'in_progress' })}
                onDone={() => void submit({ kind: 'status', to: 'done' })}
              />
              {task.status !== 'done' ? (
                <NeedHelpForm
                  busy={busy}
                  alreadyBlocked={task.status === 'blocked'}
                  onSubmit={(reason) => submit({ kind: 'need_help', reason })}
                />
              ) : null}
            </div>
            {actionError !== '' ? (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            ) : null}
          </div>

          <CollabNotes
            updates={updates}
            busy={busy}
            onAddNote={(text) => submit({ kind: 'note', text })}
          />

          <CollabUploader
            workspaceId={workspaceId}
            projectId={projectId}
            taskId={taskId}
            collaboratorId={collaboratorId}
            task={task}
            documents={documents}
          />
        </>
      )}
    </section>
  );
}
