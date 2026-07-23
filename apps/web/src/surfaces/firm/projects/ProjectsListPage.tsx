/**
 * Projects list (#12): live table of workspace projects with lifecycle badge,
 * status and % complete from the pre-aggregated summary. Deleted projects are
 * hidden; archived hide behind a toggle. Creating is owner/admin/pm-only.
 */

import { Button, Card, CardContent, CardHeader } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import { LifecycleBadge } from './LifecycleBadge.tsx';
import { ProjectForm } from './ProjectForm.tsx';
import { STATUS_LABELS } from './projectLabels.ts';
import { createProject, useProjects, type IProjectRow } from './useProjects.ts';

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
  uid: string;
  userName: string;
}

export function ProjectsListPage({
  workspaceId,
  workspaceSlug,
  workspaceName,
  role,
  uid,
  userName,
}: IProjectsListPageProps) {
  const projects = useProjects(workspaceId);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const canCreate = role === 'owner' || role === 'admin' || role === 'pm';

  const rows = projects.status === 'ready' ? projects.rows : [];
  const visible = rows.filter(
    (project) =>
      project.lifecycle !== 'deleted' && (showArchived || project.lifecycle !== 'archived'),
  );
  const archivedCount = rows.filter((project) => project.lifecycle === 'archived').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">{workspaceName}</p>
        </div>
        {canCreate && !creating && (
          <Button type="button" onClick={() => setCreating(true)}>
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
          <CardContent>
            <ProjectForm
              submitLabel="Create draft"
              onCancel={() => setCreating(false)}
              onSubmit={async (values) => {
                await createProject(workspaceId, values, uid, userName);
                setCreating(false);
              }}
            />
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
