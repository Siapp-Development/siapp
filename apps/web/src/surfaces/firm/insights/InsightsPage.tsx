/**
 * Insights section (issue #164): the workspace's analytics / project-monitoring
 * home. v1 renders a single view — the projects timeline (Gantt). This is a
 * read-only, presentation-only feature over the existing `useProjects`
 * subscription: no new Firestore reads, fields, rules or indexes.
 *
 * Extensibility: this page is a section shell, not a single chart. When a second
 * view is added (e.g. "Workload", "Status breakdown"), promote this to an
 * `InsightsLayout` with a sub-`<nav aria-label="Insights">` + nested routes
 * under `insights/*` (mirroring the existing `SettingsLayout` pattern in
 * FirmShell). `ProjectsTimeline` stays a standalone, prop-driven component so it
 * can be embedded under any future sub-route. No data-layer rework is needed.
 */

import type { TMemberRole } from '@siapp/shared';
import { Link } from 'react-router';

import { useProjects } from '../projects/useProjects.ts';
import { PortfolioStats } from './PortfolioStats.tsx';
import { ProjectsTimeline } from './ProjectsTimeline.tsx';
import { StatusDonut } from './StatusDonut.tsx';

export interface IInsightsPageProps {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: TMemberRole;
  uid: string;
}

export function InsightsPage({ workspaceId, workspaceSlug, workspaceName }: IInsightsPageProps) {
  const projects = useProjects(workspaceId);
  const rows =
    projects.status === 'ready'
      ? projects.rows.filter((project) => project.lifecycle !== 'deleted')
      : [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="border-b border-border pb-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {workspaceName}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Insights</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A high-level view of your workspace's projects and their progress.
        </p>
      </div>

      {projects.status === 'loading' && (
        <p role="status" className="text-sm">
          Loading insights…
        </p>
      )}
      {projects.status === 'error' && <p className="text-sm">Insights could not be loaded.</p>}
      {projects.status === 'ready' && rows.length === 0 && (
        <p className="text-sm">
          No projects yet —{' '}
          <Link to={`/${workspaceSlug}/projects`} className="text-primary hover:underline">
            create a project
          </Link>{' '}
          to see it on the timeline.
        </p>
      )}
      {projects.status === 'ready' && rows.length > 0 && (
        <div className="flex flex-col gap-8">
          <PortfolioStats projects={rows} />
          <StatusDonut projects={rows} />
          <ProjectsTimeline projects={rows} workspaceSlug={workspaceSlug} />
        </div>
      )}
    </div>
  );
}
