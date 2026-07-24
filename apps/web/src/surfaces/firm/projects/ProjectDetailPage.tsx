/**
 * Project detail (#12): live doc view with role-gated field editing and the
 * D-027 lifecycle actions. All transitions go through the setProjectLifecycle
 * callable; publish first runs a dryRun to show the WhatsApp count + cost
 * estimate before confirming.
 */

import { Alert, Button, Card, CardContent, CardHeader, cn } from '@siapp/ui';
import type {
  IPublishPreview,
  TMemberRole,
  TProjectLifecycle,
  TProjectLifecycleAction,
} from '@siapp/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { projectErrorCode, setProjectLifecycle } from '@/lib/callables.ts';
import { useClients } from '../clients/useClients.ts';
import { ActivitySection } from './activity/ActivitySection.tsx';
import { DocumentsSection } from './documents/DocumentsSection.tsx';
import { ExportSection } from './export/ExportSection.tsx';
import { LifecycleBadge } from './LifecycleBadge.tsx';
import { MilestonesEditor } from './milestones/MilestonesEditor.tsx';
import { PortalLinkCard } from './PortalLinkCard.tsx';
import { ProjectForm } from './ProjectForm.tsx';
import { STATUS_LABELS, VERTICAL_LABELS } from './projectLabels.ts';
import { TasksSection } from './tasks/TasksSection.tsx';
import { updateProject, useProject, type IProjectRow } from './useProjects.ts';

/** D-027 action availability by lifecycle and role (mirrors the callable). */
const LIFECYCLE_ACTIONS: Record<
  TProjectLifecycle,
  Array<{ action: TProjectLifecycleAction; roles: TMemberRole[]; label: string }>
> = {
  draft: [
    { action: 'publish', roles: ['owner', 'admin', 'pm'], label: 'Publish' },
    { action: 'delete', roles: ['owner'], label: 'Delete' },
  ],
  published: [
    { action: 'complete', roles: ['owner', 'admin', 'pm'], label: 'Mark completed' },
    { action: 'archive', roles: ['owner', 'admin'], label: 'Archive' },
    { action: 'delete', roles: ['owner'], label: 'Delete' },
  ],
  completed: [
    { action: 'reopen', roles: ['owner', 'admin'], label: 'Reopen' },
    { action: 'archive', roles: ['owner', 'admin', 'pm'], label: 'Archive' },
    { action: 'delete', roles: ['owner'], label: 'Delete' },
  ],
  archived: [{ action: 'delete', roles: ['owner'], label: 'Delete' }],
  deleted: [],
};

const PROJECT_ERROR_MESSAGES: Record<string, string> = {
  'project/not-found': 'This project no longer exists.',
  'project/invalid-transition': 'This project has changed — refresh and try again.',
  'project/forbidden-transition': 'Your role cannot perform this action.',
};

function lifecycleErrorMessage(err: unknown): string {
  const code = projectErrorCode(err);
  if (code !== null && code in PROJECT_ERROR_MESSAGES) {
    return PROJECT_ERROR_MESSAGES[code];
  }
  return err instanceof Error ? err.message : 'Could not update the project.';
}

interface IPublishConfirmProps {
  preview: IPublishPreview;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function PublishConfirm({ preview, pending, onConfirm, onCancel }: IPublishConfirmProps) {
  return (
    <Alert className="mt-3">
      <p className="text-sm font-medium">Publish this project?</p>
      <p className="mt-1 text-sm">
        {preview.waCount === 0
          ? 'No WhatsApp messages will be sent.'
          : `${preview.waCount} WhatsApp ${
              preview.waCount === 1 ? 'message' : 'messages'
            } will be sent — est. RM ${preview.estimatedCostMyr.toFixed(2)}.`}
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onConfirm}>
          {pending ? 'Publishing…' : 'Publish'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Alert>
  );
}

interface ILifecycleActionsProps {
  workspaceId: string;
  project: IProjectRow;
  role: TMemberRole;
}

function LifecycleActions({ workspaceId, project, role }: ILifecycleActionsProps) {
  const [pendingAction, setPendingAction] = useState<TProjectLifecycleAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishPreview, setPublishPreview] = useState<IPublishPreview | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const actions = LIFECYCLE_ACTIONS[project.lifecycle].filter((entry) =>
    entry.roles.includes(role),
  );
  if (actions.length === 0) {
    return null;
  }

  async function run(action: TProjectLifecycleAction, dryRun = false): Promise<void> {
    setPendingAction(action);
    setError(null);
    try {
      const result = await setProjectLifecycle({
        workspaceId,
        projectId: project.id,
        action,
        ...(dryRun ? { dryRun: true } : {}),
      });
      if (dryRun) {
        setPublishPreview(result.publishPreview ?? { waCount: 0, estimatedCostMyr: 0 });
      } else {
        setPublishPreview(null);
        setConfirmingDelete(false);
      }
    } catch (err) {
      setError(lifecycleErrorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  function handleClick(action: TProjectLifecycleAction): void {
    setError(null);
    if (action === 'publish') {
      void run('publish', true);
      return;
    }
    if (action === 'delete') {
      setConfirmingDelete(true);
      return;
    }
    void run(action);
  }

  return (
    <div>
      {error !== null && (
        <Alert variant="destructive" className="mb-3">
          {error}
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map((entry) => (
          <Button
            key={entry.action}
            type="button"
            variant={entry.action === 'delete' ? 'destructive' : 'outline'}
            size="sm"
            disabled={pendingAction !== null}
            onClick={() => handleClick(entry.action)}
          >
            {entry.label}
          </Button>
        ))}
      </div>
      {publishPreview !== null && (
        <PublishConfirm
          preview={publishPreview}
          pending={pendingAction === 'publish'}
          onConfirm={() => void run('publish')}
          onCancel={() => setPublishPreview(null)}
        />
      )}
      {confirmingDelete && (
        <Alert variant="destructive" className="mt-3">
          <p className="text-sm font-medium">Delete this project?</p>
          <p className="mt-1 text-sm">
            The project disappears from lists and stops all messaging. This cannot be undone from
            the app.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pendingAction !== null}
              onClick={() => void run('delete')}
            >
              {pendingAction === 'delete' ? 'Deleting…' : 'Delete project'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}

export interface IProjectDetailPageProps {
  workspaceId: string;
  workspaceSlug: string;
  role: TMemberRole;
  departments: string[];
  uid: string;
  userName: string;
}

export function ProjectDetailPage({
  workspaceId,
  workspaceSlug,
  role,
  departments,
  uid,
  userName,
}: IProjectDetailPageProps) {
  const { projectId = '' } = useParams<'projectId'>();
  const state = useProject(workspaceId, projectId);
  const clients = useClients(workspaceId);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'tasks' | 'documents' | 'activity' | 'details'>('tasks');

  if (state.status === 'loading') {
    return <p className="text-sm">Loading project…</p>;
  }
  if (state.status === 'error' || state.status === 'missing') {
    return (
      <div>
        <p className="text-sm">This project could not be loaded.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to={`/${workspaceSlug}/projects`}>Back to projects</Link>
        </Button>
      </div>
    );
  }

  const project = state.project;
  const canEdit =
    (role === 'owner' || role === 'admin' || role === 'pm') &&
    (project.lifecycle === 'draft' || project.lifecycle === 'published');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/${workspaceSlug}/projects`}
          className="text-sm text-muted-foreground hover:text-primary"
        >
          ← Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <LifecycleBadge lifecycle={project.lifecycle} />
        </div>
        {project.lifecycle === 'completed' && (
          <p className="mt-1 text-sm text-muted-foreground">
            Completed projects are read-only — reopen to make changes.
          </p>
        )}
      </div>

      <div role="tablist" aria-label="Project sections" className="flex gap-1 border-b">
        {(
          [
            { id: 'tasks', label: 'Tasks' },
            { id: 'documents', label: 'Documents' },
            { id: 'activity', label: 'Activity' },
            { id: 'details', label: 'Details' },
          ] as const
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              tab === entry.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'tasks' && (
        <TasksSection
          workspaceId={workspaceId}
          projectId={project.id}
          role={role}
          departments={departments}
          uid={uid}
          userName={userName}
          canEdit={canEdit}
          lifecycle={project.lifecycle}
        />
      )}

      {tab === 'documents' && (
        <DocumentsSection
          workspaceId={workspaceId}
          projectId={project.id}
          role={role}
          departments={departments}
          uid={uid}
          userName={userName}
          canEdit={canEdit}
        />
      )}

      {tab === 'activity' && (
        <ActivitySection
          workspaceId={workspaceId}
          projectId={project.id}
          role={role}
          departments={departments}
        />
      )}

      {tab === 'details' && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="text-lg font-semibold">Details</h2>
              {canEdit && !editing && (
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editing ? (
                <ProjectForm
                  project={project}
                  clients={clients.status === 'ready' ? clients.rows : []}
                  submitLabel="Save changes"
                  onCancel={() => setEditing(false)}
                  onSubmit={async (values) => {
                    await updateProject(
                      workspaceId,
                      project.id,
                      values,
                      project.collaboratorsCount,
                    );
                    setEditing(false);
                  }}
                />
              ) : (
                <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Client</dt>
                    <dd>
                      {project.clientNameDenorm !== ''
                        ? project.clientNameDenorm
                        : 'No client linked'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{STATUS_LABELS[project.status]}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Vertical</dt>
                    <dd>{VERTICAL_LABELS[project.vertical]}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Owner</dt>
                    <dd>{project.ownerNameDenorm}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Start date</dt>
                    <dd>{project.startDate?.toLocaleDateString() ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Target end</dt>
                    <dd>{project.targetEndDate?.toLocaleDateString() ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Progress</dt>
                    <dd>
                      {project.progressPct}% ({project.doneTasks}/{project.totalTasks} tasks
                      {project.overdueTasks > 0 && `, ${project.overdueTasks} overdue`})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Client visibility</dt>
                    <dd>
                      {project.clientCanSee ? 'Client can see this project' : 'Hidden from client'}
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>

          <PortalLinkCard
            workspaceId={workspaceId}
            projectId={project.id}
            lifecycle={project.lifecycle}
            clientId={project.clientId}
            role={role}
          />

          <MilestonesEditor workspaceId={workspaceId} projectId={project.id} canEdit={canEdit} />

          {(role === 'owner' || role === 'admin') && (
            <ExportSection workspaceId={workspaceId} projectId={project.id} role={role} />
          )}

          <LifecycleActions workspaceId={workspaceId} project={project} role={role} />
        </>
      )}
    </div>
  );
}
