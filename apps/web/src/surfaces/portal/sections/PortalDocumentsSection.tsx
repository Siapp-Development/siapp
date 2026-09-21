/**
 * Documents section (#126, D-042): inline preview of client-visible documents
 * plus a direct upload. Reuses the existing usePortalDocuments /
 * uploadPortalDocument / validateClientFile / portalDownloadUrl logic
 * unchanged (extracted from the old PortalDocumentsPage) so both the screen
 * and the print layout can render it. Pass `interactive={false}` for print —
 * a static list with no uploader or download buttons.
 */

import { useId, useState } from 'react';

import { usePortalDocumentUpload } from '../documents/usePortalDocumentUpload.ts';
import {
  portalDownloadUrl,
  softDeletePortalDocument,
  usePortalDocuments,
  type TClientFileError,
} from '../documents/usePortalDocuments.ts';

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const INVALID_MESSAGES: Record<TClientFileError, string> = {
  'too-large': 'That file is larger than 10 MB. Please choose a smaller file.',
  unsupported: 'That file type isn’t supported. Try a PDF, image, or Word document.',
};

export interface IPortalDocumentsSectionProps {
  workspaceId: string;
  projectId: string;
  clientId: string;
  /** When false, render a static list only (print). Defaults to true. */
  interactive?: boolean;
}

export function PortalDocumentsSection({
  workspaceId,
  projectId,
  clientId,
  interactive = true,
}: IPortalDocumentsSectionProps) {
  const state = usePortalDocuments(workspaceId, projectId);
  const upload = usePortalDocumentUpload({ workspaceId, projectId, clientId });
  const headingId = useId();
  const uploadId = useId();
  // Per-row soft-delete UX state (only one row is ever mid-flow). Mirrors the
  // firm inline-confirm pattern — no shared confirm dialog / window.confirm.
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    phase: 'confirm' | 'deleting' | 'error';
  } | null>(null);

  async function handleDownload(storagePath: string): Promise<void> {
    try {
      const url = await portalDownloadUrl(storagePath);
      window.open(url, '_blank', 'noopener');
    } catch {
      // Transient — the button stays available to retry.
    }
  }

  async function handleDelete(documentId: string): Promise<void> {
    setPendingDelete({ id: documentId, phase: 'deleting' });
    try {
      await softDeletePortalDocument({ workspaceId, projectId, clientId, documentId });
      // Row disappears via the live snapshot; clear any lingering state.
      setPendingDelete(null);
    } catch {
      setPendingDelete({ id: documentId, phase: 'error' });
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border bg-card p-4 shadow-card"
    >
      <h2 id={headingId} className="text-sm font-semibold">
        Documents
      </h2>

      {interactive && (
        <div className="mt-3 rounded-lg border border-border p-4 print:hidden">
          <label htmlFor={uploadId} className="text-sm font-medium">
            Share a file with your project team
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, images, or Word documents up to 10 MB.
          </p>
          <input
            ref={upload.inputRef}
            id={uploadId}
            type="file"
            accept={upload.accept}
            disabled={upload.state.status === 'uploading'}
            onChange={upload.handleInputChange}
            className="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
          />
          {upload.state.status === 'uploading' && (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              Uploading… {upload.state.percent}%
            </p>
          )}
          {upload.state.status === 'done' && (
            <p role="status" className="mt-2 text-sm text-primary">
              File shared with your project team.
            </p>
          )}
          {upload.state.status === 'invalid' && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {INVALID_MESSAGES[upload.state.reason]}
            </p>
          )}
          {upload.state.status === 'failed' && (
            <div role="alert" className="mt-2 text-sm text-destructive">
              <p>The upload didn’t finish. Check your connection and try again.</p>
              <button
                type="button"
                onClick={upload.retry}
                className="mt-1 rounded-md border border-border px-3 py-1 text-sm font-medium text-foreground hover:bg-muted"
              >
                Retry upload
              </button>
            </div>
          )}
        </div>
      )}

      {state.status === 'loading' && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Loading documents&hellip;
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          We couldn&rsquo;t load documents right now. Please try again shortly.
        </p>
      )}
      {state.status === 'ready' &&
        (state.rows.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No documents shared yet.
          </p>
        ) : (
          <ul aria-label="Shared documents" className="mt-3 space-y-2">
            {state.rows.map((row) => {
              const isLink = row.attachmentType === 'link';
              // #168: only the caller's OWN uploaded files are deletable
              // (never firm rows, never link rows). Hidden in print.
              const isDeletable =
                interactive &&
                !isLink &&
                row.uploaderType === 'client' &&
                row.uploadedBy === clientId;
              const rowDelete = pendingDelete?.id === row.id ? pendingDelete : null;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isLink ? 'Google Drive link' : formatSize(row.sizeBytes)}
                      {row.uploadedAt !== null && ` · ${DATE_FORMAT.format(row.uploadedAt)}`}
                      {row.uploaderType === 'client' && ' · shared by you'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isLink ? (
                      interactive && (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden"
                        >
                          Open
                          <span className="sr-only"> {row.name} (opens in a new tab)</span>
                        </a>
                      )
                    ) : row.scanStatus === 'infected' ? (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        Blocked by virus scan
                      </span>
                    ) : (
                      interactive && (
                        <button
                          type="button"
                          onClick={() => void handleDownload(row.storagePath)}
                          className="shrink-0 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden"
                        >
                          Download
                          <span className="sr-only"> {row.name}</span>
                        </button>
                      )
                    )}
                    {isDeletable && rowDelete?.phase === 'confirm' && (
                      <span
                        role="group"
                        aria-label={`Confirm deleting ${row.name}`}
                        className="flex shrink-0 items-center gap-2 print:hidden"
                      >
                        <span className="text-xs text-muted-foreground">Delete this file?</span>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row.id)}
                          className="shrink-0 rounded-md border border-destructive px-3 py-1 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          Delete
                          <span className="sr-only"> {row.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(null)}
                          className="shrink-0 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          Cancel
                          <span className="sr-only"> deleting {row.name}</span>
                        </button>
                      </span>
                    )}
                    {isDeletable && rowDelete?.phase === 'deleting' && (
                      <span
                        role="status"
                        className="shrink-0 text-xs text-muted-foreground print:hidden"
                      >
                        Deleting {row.name}…
                      </span>
                    )}
                    {isDeletable && rowDelete === null && (
                      <button
                        type="button"
                        onClick={() => setPendingDelete({ id: row.id, phase: 'confirm' })}
                        className="shrink-0 rounded-md border border-border px-3 py-1 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden"
                      >
                        Delete
                        <span className="sr-only"> {row.name}</span>
                      </button>
                    )}
                  </div>
                  {isDeletable && rowDelete?.phase === 'error' && (
                    <div
                      role="alert"
                      className="basis-full text-sm text-destructive print:hidden"
                    >
                      <p>
                        We couldn&rsquo;t delete
                        <span className="sr-only"> {row.name}</span> that file. Please try again.
                      </p>
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDelete(row.id)}
                          className="rounded-md border border-destructive px-3 py-1 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          Try again
                          <span className="sr-only"> deleting {row.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(null)}
                          className="rounded-md border border-border px-3 py-1 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
