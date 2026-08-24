/**
 * Projects list (#12): live table of workspace projects with lifecycle badge,
 * status and % complete from the pre-aggregated summary. Deleted projects are
 * hidden; archived hide behind a toggle. Creating is owner/admin/pm-only.
 * #15 (D-031): the New-project card is a two-mode chooser — Blank, or
 * Duplicate from existing (structure carries, content clears).
 */

import { Badge, Button, Card, CardContent, CardHeader, Label, Progress } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useClients } from '../clients/useClients.ts';
import {
  DuplicateBlockedError,
  DuplicateTooLargeError,
  duplicateProject,
} from './duplicateProject.ts';
import { LifecycleBadge } from './LifecycleBadge.tsx';
import { ProjectForm } from './ProjectForm.tsx';
import { ProjectsListControls } from './ProjectsListControls.tsx';
import {
  filterAndSortProjects,
  parseProjectsListParams,
  writeProjectsListParams,
  type IProjectsListParams,
} from './projectsListFilter.ts';
import { STATUS_LABELS } from './projectLabels.ts';
import { TagChipList } from './tags/TagChipList.tsx';
import { useTags, type ITagEntry } from './tags/useTags.ts';
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
  tags: ReadonlyMap<string, ITagEntry>;
}

function ProjectListItem({ project, workspaceSlug, tags }: IProjectListItemProps) {
  return (
    <li className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-card transition-colors duration-150 hover:border-primary/40">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="flex min-w-0 items-center gap-2">
          <Link
            to={`/${workspaceSlug}/projects/${project.id}`}
            className="truncate font-display text-base font-semibold text-foreground hover:text-primary"
          >
            {project.name}
          </Link>
          {project.code !== '' && <Badge variant="outline">{project.code}</Badge>}
          <LifecycleBadge lifecycle={project.lifecycle} />
          {project.overdueTasks > 0 && (
            <Badge variant="danger">{project.overdueTasks} overdue</Badge>
          )}
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
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {STATUS_LABELS[project.status]}
        {' · '}
        {project.clientNameDenorm !== '' ? project.clientNameDenorm : 'No client linked'}
        {project.startDate !== null && ` · starts ${project.startDate.toLocaleDateString()}`}
        {project.targetEndDate !== null && ` · due ${project.targetEndDate.toLocaleDateString()}`}
      </p>
      <TagChipList tagIds={project.tags} tags={tags} label={project.name} className="mt-2" />
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
  const clients = useClients(workspaceId);
  const projectTags = useTags(workspaceId, 'project');
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreate = role === 'owner' || role === 'admin' || role === 'pm';
  // ?new=1 opens the chooser on arrival (the Home "New project" CTA, #17).
  const [creating, setCreating] = useState(canCreate && searchParams.get('new') === '1');
  const [createMode, setCreateMode] = useState<'blank' | 'duplicate'>('blank');
  const [sourceId, setSourceId] = useState('');

  const listParams = useMemo(() => parseProjectsListParams(searchParams), [searchParams]);

  function updateListParams(next: IProjectsListParams): void {
    setSearchParams(writeProjectsListParams(next, searchParams), { replace: true });
  }

  const rows = projects.status === 'ready' ? projects.rows : [];
  const clientOptions = clients.status === 'ready' ? clients.rows : [];
  const visible = filterAndSortProjects(rows, listParams, projectTags.tags);
  const duplicatable = rows.filter((project) => project.lifecycle !== 'deleted');
  const source = duplicatable.find((project) => project.id === sourceId);

  function openCreateCard(): void {
    setCreateMode('blank');
    setSourceId('');
    setCreating(true);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {workspaceName}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Projects</h1>
        </div>
        {canCreate && !creating && (
          <Button type="button" onClick={openCreateCard}>
            <Plus className="h-4 w-4" aria-hidden />
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
                clients={clientOptions}
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
                      clients={clientOptions}
                      prefill={{
                        name: `Copy of ${source.name}`,
                        code: '',
                        vertical: source.vertical,
                        status: 'planning',
                        clientId: '',
                        clientName: '',
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

      {projects.status === 'ready' && rows.length > 0 && (
        <ProjectsListControls
          params={listParams}
          onChange={updateListParams}
          projectTags={projectTags.tags}
          clients={clientOptions}
        />
      )}

      {projects.status === 'loading' && <p className="text-sm">Loading projects…</p>}
      {projects.status === 'error' && <p className="text-sm">Projects could not be loaded.</p>}
      {projects.status === 'ready' && rows.length === 0 && (
        <p className="text-sm">No projects yet.</p>
      )}
      {projects.status === 'ready' && rows.length > 0 && visible.length === 0 && (
        <p className="text-sm">No projects match your filters.</p>
      )}
      {projects.status === 'ready' && visible.length > 0 && (
        <ul className="flex flex-col gap-2">
          {visible.map((project) => (
            <ProjectListItem
              key={project.id}
              project={project}
              workspaceSlug={workspaceSlug}
              tags={projectTags.tags}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
