/**
 * Projects list (#12): live table of workspace projects with lifecycle badge,
 * status and % complete from the pre-aggregated summary. Deleted projects are
 * hidden; archived hide behind a toggle. Creating is owner/admin/pm-only.
 * #15 (D-031): the New-project card is a two-mode chooser — Blank, or
 * Duplicate from existing (structure carries, content clears).
 */

import { Button, Card, CardContent, CardHeader, Label } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import {
  DuplicateBlockedError,
  DuplicateTooLargeError,
  duplicateProject,
} from './duplicateProject.ts';
import { LifecycleBadge } from './LifecycleBadge.tsx';
import { ProjectForm } from './ProjectForm.tsx';
import { STATUS_LABELS } from './projectLabels.ts';
import { createProject, useProjects, type IProjectRow } from './useProjects.ts';

function duplicateErrorMessage(error: unknown): string {
  if (error instanceof DuplicateBlockedError) {
    return `This project has ${error.hiddenCount} restricted task(s) you can't access — ask an owner or admin to duplicate it.`;
  }
  if (error instanceof DuplicateTooLargeError) {
    return 'This project is too large to duplicate.';
  }
  return 'Could not duplicate the project.';
}

interface IProjectListItemProps {
  project: IProjectRow;
  workspaceSlug: string;
}

function ProjectListItem({ project, workspaceSlug }: IProjectListItemProps) {
  return (
    <li className="rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Link
            to={`/${workspaceSlug}/projects/${project.id}`}
            className="font-medium text-foreground hover:text-primary"
          >
            {project.name}
          </Link>
          {project.code !== '' && (
            <span className="text-xs text-muted-foreground">{project.code}</span>
          )}
          <LifecycleBadge lifecycle={project.lifecycle} />
        </span>
        <span className="text-sm text-muted-foreground">
          {STATUS_LABELS[project.status]} · {project.progressPct}% complete
          {project.overdueTasks > 0 && ` · ${project.overdueTasks} overdue`}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {project.clientNameDenorm !== '' ? project.clientNameDenorm : 'No client linked'}
        {project.startDate !== null && ` · starts ${project.startDate.toLocaleDateString()}`}
        {project.targetEndDate !== null && ` · due ${project.targetEndDate.toLocaleDateString()}`}
      </p>
    </li>
  );
}

export interface IProjectsListPageProps {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: TMemberRole;
  departments: string[];
  uid: string;
  userName: string;
}

export function ProjectsListPage({
  workspaceId,
  workspaceSlug,
  workspaceName,
  role,
  departments,
  uid,
  userName,
}: IProjectsListPageProps) {
  const projects = useProjects(workspaceId);
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState<'blank' | 'duplicate'>('blank');
  const [sourceId, setSourceId] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const canCreate = role === 'owner' || role === 'admin' || role === 'pm';

  const rows = projects.status === 'ready' ? projects.rows : [];
  const visible = rows.filter(
    (project) =>
      project.lifecycle !== 'deleted' && (showArchived || project.lifecycle !== 'archived'),
  );
  const archivedCount = rows.filter((project) => project.lifecycle === 'archived').length;
  const duplicatable = rows.filter((project) => project.lifecycle !== 'deleted');
  const source = duplicatable.find((project) => project.id === sourceId);

  function openCreateCard(): void {
    setCreateMode('blank');
    setSourceId('');
    setCreating(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">{workspaceName}</p>
        </div>
        {canCreate && !creating && (
          <Button type="button" onClick={openCreateCard}>
            New project
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">New project</h2>
            <p className="text-sm">
              Projects start as drafts — no messages go out until you publish.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <fieldset>
              <legend className="text-sm font-medium">Start from</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="project-create-mode"
                    value="blank"
                    checked={createMode === 'blank'}
                    onChange={() => setCreateMode('blank')}
                  />
                  Blank
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="project-create-mode"
                    value="duplicate"
                    checked={createMode === 'duplicate'}
                    onChange={() => setCreateMode('duplicate')}
                  />
                  Duplicate from existing
                </label>
              </div>
            </fieldset>

            {createMode === 'blank' && (
              <ProjectForm
                submitLabel="Create draft"
                onCancel={() => setCreating(false)}
                onSubmit={async (values) => {
                  await createProject(workspaceId, values, uid, userName);
                  setCreating(false);
                }}
              />
            )}

            {createMode === 'duplicate' && (
              <>
                <div className="flex max-w-md flex-col gap-1.5">
                  <Label htmlFor="duplicate-source">Source project</Label>
                  <select
                    id="duplicate-source"
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                    value={sourceId}
                    onChange={(event) => setSourceId(event.target.value)}
                  >
                    <option value="">Select a project…</option>
                    {duplicatable.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                        {project.code !== '' ? ` (${project.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {source !== undefined && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Copies phases, tasks, order, dependencies and visibility settings.
                      Assignees, dates, statuses, updates and documents are not copied. The
                      copy starts as a draft.
                    </p>
                    <ProjectForm
                      key={source.id}
                      prefill={{
                        name: `Copy of ${source.name}`,
                        code: '',
                        vertical: source.vertical,
                        status: 'planning',
                        startDate: new Date(),
                        targetEndDate: null,
                        clientCanSee: source.clientCanSee,
                      }}
                      verticalLocked
                      errorMessage={duplicateErrorMessage}
                      submitLabel="Create draft"
                      onCancel={() => setCreating(false)}
                      onSubmit={async (values) => {
                        await duplicateProject({
                          workspaceId,
                          sourceProjectId: source.id,
                          values,
                          uid,
                          ownerName: userName,
                          role,
                          departments,
                        });
                        setCreating(false);
                      }}
                    />
                  </>
                )}
                {source === undefined && (
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    onClick={() => setCreating(false)}
                  >
                    Cancel
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {projects.status === 'loading' && <p className="text-sm">Loading projects…</p>}
      {projects.status === 'error' && <p className="text-sm">Projects could not be loaded.</p>}
      {projects.status === 'ready' && visible.length === 0 && (
        <p className="text-sm">No projects yet.</p>
      )}
      {projects.status === 'ready' && visible.length > 0 && (
        <ul className="flex flex-col gap-2">
          {visible.map((project) => (
            <ProjectListItem key={project.id} project={project} workspaceSlug={workspaceSlug} />
          ))}
        </ul>
      )}
      {archivedCount > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setShowArchived((current) => !current)}
        >
          {showArchived
            ? 'Hide archived'
            : `Show archived (${archivedCount})`}
        </Button>
      )}
    </div>
  );
}
