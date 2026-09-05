/**
 * Print-only layout (#126, D-042): a `hidden print:block` DOM that renders
 * the whole project on one landscape sheet — header, overall progress, BOTH
 * task views (List + fit-to-width Timeline), recent updates, and documents
 * (static, no uploader/downloads). window.print() (Print button) plus the
 * `@media print` rules in globals.css do the rest; no print dependency.
 */

import { CircularProgress } from '@siapp/ui';

import { PortalDocumentsSection } from '../sections/PortalDocumentsSection.tsx';
import { PortalUpdatesSection } from '../sections/PortalUpdatesSection.tsx';
import { PortalTaskList } from '../tasks/PortalTaskList.tsx';
import { PortalTaskTimeline } from '../tasks/PortalTaskTimeline.tsx';
import type { IPortalTaskGroup } from '../tasks/usePortalTasks.ts';
import type { IPortalProject } from '../usePortalProject.ts';

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDate(date: Date | null): string {
  return date === null ? '—' : DATE_FORMAT.format(date);
}

export interface IPortalPrintLayoutProps {
  project: IPortalProject;
  groups: readonly IPortalTaskGroup[];
  workspaceId: string;
  projectId: string;
  clientId: string;
}

export function PortalPrintLayout({
  project,
  groups,
  workspaceId,
  projectId,
  clientId,
}: IPortalPrintLayoutProps) {
  const progress = Math.min(100, Math.max(0, Math.round(project.progressPct)));

  return (
    <div className="print-layout hidden print:block" aria-hidden="true">
      <header className="flex items-start justify-between gap-6 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          {project.clientName !== '' && (
            <p className="mt-1 text-sm text-muted-foreground">Prepared for {project.clientName}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Started {formatDate(project.startDate)} · Target completion{' '}
            {formatDate(project.targetEndDate)}
          </p>
        </div>
        <CircularProgress
          value={progress}
          label={`${progress}% complete`}
          size={90}
          indicatorClassName="text-accent"
        >
          <span className="font-display text-xl font-bold tabular-nums">{progress}%</span>
        </CircularProgress>
      </header>

      <section className="mt-6 break-inside-avoid" aria-label="Project tasks list">
        <h2 className="mb-2 text-base font-semibold">Project tasks</h2>
        <PortalTaskList groups={groups} />
      </section>

      <section className="mt-6 break-inside-avoid" aria-label="Project timeline">
        <h2 className="mb-2 text-base font-semibold">Timeline</h2>
        <PortalTaskTimeline groups={groups} fitToWidth />
      </section>

      <section className="mt-6 break-inside-avoid" aria-label="Recent updates">
        <PortalUpdatesSection workspaceId={workspaceId} projectId={projectId} />
      </section>

      <section className="mt-6 break-inside-avoid" aria-label="Documents">
        <PortalDocumentsSection
          workspaceId={workspaceId}
          projectId={projectId}
          clientId={clientId}
          interactive={false}
        />
      </section>
    </div>
  );
}
