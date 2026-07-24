/**
 * Collaborator task page at siapp.app/t/:token (#22) — lazy-loaded, warm
 * portal theme, mobile-first, submit-only (Q1). Redeems the link token for a
 * collab session, then renders the pinned task with status actions (D-b),
 * need-help (D-d), own notes (D-c) and file exchange (D-f).
 */

import type { TTaskStatus } from '@siapp/shared';
import { useState } from 'react';
import { useParams } from 'react-router';

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
      <CollabTaskView session={state.session} />
    </CollabSessionProvider>
  );
}

function CollabTaskView({ session }: { session: ICollabSession }) {
  const { workspaceId, projectId, taskId, collaboratorId, branding } = session;
  const taskState = useCollabTask(workspaceId, projectId, taskId);
  const updates = useCollabUpdates(workspaceId, projectId, taskId, collaboratorId);
  const documents = useCollabDocuments(workspaceId, projectId, taskId, collaboratorId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  // Soft revocation mid-session (Q1): rules closed the read path.
  if (taskState.status === 'gone') {
    return <CollabInvalidState />;
  }

  async function submit(update: Parameters<typeof submitCollabUpdate>[0]['update']): Promise<void> {
    setBusy(true);
    setActionError('');
    try {
      await submitCollabUpdate({ update });
    } catch {
      setActionError('That didn’t go through. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const task: ICollabTask | null = taskState.status === 'ready' ? taskState.task : null;
  const title = task?.title ?? session.task.title;

  return (
    <>
      <SkipLink />
      <header className="border-b border-border bg-card px-6 py-4">
        <p className="text-sm text-muted-foreground">
          {branding.firmName !== '' ? branding.firmName : 'Project team'} ·{' '}
          {session.task.projectName}
        </p>
        <h1 className="mt-1 text-xl font-bold">{title}</h1>
      </header>
      <main id="main" className="mx-auto max-w-xl space-y-8 px-6 py-8">
        {task === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading task&hellip;
          </p>
        ) : (
          <>
            <section aria-labelledby="collab-task-heading" className="space-y-3">
              <h2 id="collab-task-heading" className="sr-only">
                Task details
              </h2>
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
            </section>

            <section aria-labelledby="collab-actions-heading" className="space-y-4">
              <h2 id="collab-actions-heading" className="sr-only">
                Update status
              </h2>
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
            </section>

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
      </main>
    </>
  );
}
