/**
 * Portal project header (#126, D-042): project + client detail in a card, with
 * a shortcut "Upload Document" button (a quick path to share a file — the
 * upload also surfaces in the Documents section list) and a Print action. The
 * actions live here (not the shell) because they need project context. Print
 * triggers window.print(), which the print stylesheet turns into a landscape
 * summary.
 */

import { Button } from '@siapp/ui';
import { FileUp, Printer } from 'lucide-react';
import { useId } from 'react';

import { usePortalDocumentUpload } from '../documents/usePortalDocumentUpload.ts';
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
  workspaceId: string;
  projectId: string;
  clientId: string;
}

export function PortalHeader({ project, workspaceId, projectId, clientId }: IPortalHeaderProps) {
  const headingId = useId();
  const upload = usePortalDocumentUpload({ workspaceId, projectId, clientId });

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <h1 id={headingId} className="text-3xl font-bold tracking-tight">
        {project.name}
      </h1>
      {project.clientName !== '' && (
        <p className="mt-1 text-sm text-muted-foreground">{project.clientName}</p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">Start date</dt>
          <dd className="mt-0.5 font-medium">{formatDate(project.startDate)}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            Target completion
          </dt>
          <dd className="mt-0.5 font-medium">{formatDate(project.targetEndDate)}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-col gap-2 print:hidden sm:flex-row">
        <Button
          type="button"
          onClick={upload.openPicker}
          disabled={upload.state.status === 'uploading'}
          className="w-full sm:flex-1"
        >
          <FileUp className="h-4 w-4 shrink-0" aria-hidden="true" />
          Upload Document
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => window.print()}
          aria-label="Print project summary"
          className="w-full sm:w-auto"
        >
          <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
          Print
        </Button>
      </div>

      <input
        ref={upload.inputRef}
        type="file"
        accept={upload.accept}
        onChange={upload.handleInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      {upload.state.status === 'uploading' && (
        <p role="status" className="mt-2 text-sm text-muted-foreground print:hidden">
          Uploading… {upload.state.percent}%
        </p>
      )}
      {upload.state.status === 'done' && (
        <p role="status" className="mt-2 text-sm text-primary print:hidden">
          File shared with your project team.
        </p>
      )}
      {upload.state.status === 'invalid' && (
        <p role="alert" className="mt-2 text-sm text-destructive print:hidden">
          {upload.state.reason === 'too-large'
            ? 'That file is larger than 10 MB. Please choose a smaller file.'
            : 'That file type isn’t supported. Try a PDF, image, or Word document.'}
        </p>
      )}
      {upload.state.status === 'failed' && (
        <p role="alert" className="mt-2 text-sm text-destructive print:hidden">
          The upload didn’t finish. Check your connection and try again.
        </p>
      )}
    </section>
  );
}
