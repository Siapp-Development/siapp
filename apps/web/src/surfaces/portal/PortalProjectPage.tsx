import { PortalDocumentsSection } from './sections/PortalDocumentsSection.tsx';
import { PortalHeader } from './sections/PortalHeader.tsx';
import { PortalProgressSection } from './sections/PortalProgressSection.tsx';
import { PortalTasksSection } from './sections/PortalTasksSection.tsx';
import { PortalUpdatesSection } from './sections/PortalUpdatesSection.tsx';
import { PortalPrintLayout } from './print/PortalPrintLayout.tsx';
import { usePortalTasks } from './tasks/usePortalTasks.ts';
import { usePortalProject } from './usePortalProject.ts';
import { usePortalSessionContext } from './usePortalSession.ts';

/**
 * Client portal single-screen dashboard (#126, D-042): a project header
 * (title, client, dates, Print) plus four sections — Overall Progress,
 * Project Tasks (phase-grouped preview + "Show all tasks" modal with List &
 * Timeline views), Recent Updates, and Documents. Progress is the
 * server-maintained progressPct (D5, never recomputed). The former standalone
 * Current phase / Next milestone blocks and the timespan bar are removed;
 * milestones are no longer rendered (phases survive only as task-group
 * headers). A print-only layout renders everything landscape for export.
 */
export function PortalProjectPage() {
  const session = usePortalSessionContext();
  const projectState = usePortalProject(session.workspaceId, session.projectId);
  const phases = projectState.status === 'ready' ? projectState.phases : [];
  const tasksState = usePortalTasks(session.workspaceId, session.projectId, phases);

  if (projectState.status === 'loading') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading your project&hellip;
      </p>
    );
  }
  if (projectState.status === 'error') {
    return (
      <p role="alert" className="text-destructive">
        We couldn&rsquo;t load your project right now. Please try again shortly.
      </p>
    );
  }

  const { project } = projectState;
  const groups = tasksState.status === 'ready' ? tasksState.groups : [];

  return (
    <>
      <div className="flex flex-col gap-6 print:hidden">
        <PortalHeader
          project={project}
          workspaceId={session.workspaceId}
          projectId={session.projectId}
          clientId={session.clientId}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <PortalProgressSection progressPct={project.progressPct} />
          <PortalTasksSection groups={groups} projectName={project.name} />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <PortalUpdatesSection workspaceId={session.workspaceId} projectId={session.projectId} />
          <PortalDocumentsSection
            workspaceId={session.workspaceId}
            projectId={session.projectId}
            clientId={session.clientId}
          />
        </div>
      </div>

      <PortalPrintLayout
        project={project}
        groups={groups}
        workspaceId={session.workspaceId}
        projectId={session.projectId}
        clientId={session.clientId}
      />
    </>
  );
}
