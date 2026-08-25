/**
 * Portal project header (#126, D-042): project title, client name,
 * start/target dates, and a Print action. The Print button lives here (not
 * the shell) because it needs project context; it triggers window.print(),
 * which the print stylesheet turns into a landscape summary.
 */

import { Button } from '@siapp/ui';
import { Printer } from 'lucide-react';
import { useId } from 'react';

import type { IPortalProject } from '../usePortalProject.ts';

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDate(date: Date | null): string {
  return date === null ? '—' : DATE_FORMAT.format(date);
}

export interface IPortalHeaderProps {
  project: IPortalProject;
}

export function PortalHeader({ project }: IPortalHeaderProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 id={headingId} className="text-3xl font-bold tracking-tight">
            {project.name}
          </h1>
          {project.clientName !== '' && (
            <p className="mt-1 text-sm text-muted-foreground">
              Prepared for{' '}
              <span className="font-medium text-foreground">{project.clientName}</span>
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          aria-label="Print project summary"
          className="shrink-0 print:hidden"
        >
          <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
          Print
        </Button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Started</dt>
          <dd className="mt-0.5 font-medium">{formatDate(project.startDate)}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            Target completion
          </dt>
          <dd className="mt-0.5 font-medium">{formatDate(project.targetEndDate)}</dd>
        </div>
      </dl>
    </section>
  );
}
