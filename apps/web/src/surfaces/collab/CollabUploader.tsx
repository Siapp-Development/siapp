/**
 * Collaborator uploads for the /t page (#22, D-f): direct rules-gated
 * Storage writes to collab-uploads/ (≤25 MB, image/PDF/DOCX/ZIP) plus a live
 * list of the task-scoped documents shared with this collaborator.
 */

import { FileText, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { COLLAB_ALLOWED_DOCUMENT_MIME_TYPES } from '@siapp/shared';

import {
  collabDownloadUrl,
  uploadCollabDocument,
  validateCollabFile,
  type ICollabTask,
  type TCollabDocumentsState,
} from './useCollabTask.ts';

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' });

const FILE_INPUT_ACCEPT = `${COLLAB_ALLOWED_DOCUMENT_MIME_TYPES.join(',')},.dwg`;

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type TUploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; percent: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

export function CollabUploader({
  workspaceId,
  projectId,
  taskId,
  collaboratorId,
  task,
  documents,
}: {
  workspaceId: string;
  projectId: string;
  taskId: string;
  collaboratorId: string;
  task: ICollabTask;
  documents: TCollabDocumentsState;
}) {
  const [upload, setUpload] = useState<TUploadState>({ phase: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File): Promise<void> {
    const invalid = validateCollabFile({ name: file.name, size: file.size, type: file.type });
    if (invalid !== null) {
      setUpload({
        phase: 'error',
        message:
          invalid === 'too-large'
            ? 'That file is over the 25 MB limit.'
            : 'Only images, PDFs, Word documents, and ZIP files can be uploaded.',
      });
      return;
    }
    setUpload({ phase: 'uploading', percent: 0 });
    try {
      await uploadCollabDocument({
        workspaceId,
        projectId,
        taskId,
        collaboratorId,
        taskVisibleToClient: task.visibleToClient,
        taskRestrictedToDepartments: task.restrictedToDepartments,
        file,
        onProgress: (percent) => setUpload({ phase: 'uploading', percent }),
      });
      setUpload({ phase: 'done' });
    } catch {
      setUpload({ phase: 'error', message: 'Upload failed. Please try again.' });
    }
  }

  async function openDocument(storagePath: string): Promise<void> {
    try {
      const url = await collabDownloadUrl(storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setUpload({ phase: 'error', message: 'That file couldn’t be opened.' });
    }
  }

  return (
    <section aria-labelledby="collab-files-heading" className="space-y-4">
      <h2 id="collab-files-heading" className="text-lg font-semibold">
        Files
      </h2>
      <div>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          accept={FILE_INPUT_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              void handleFile(file);
            }
            event.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={upload.phase === 'uploading'}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold shadow-card hover:bg-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Upload aria-hidden="true" className="size-4" />
          Upload a file
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          Images, PDF, Word, or ZIP — up to 25 MB.
        </p>
        <div aria-live="polite">
          {upload.phase === 'uploading' ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              Uploading&hellip; {upload.percent}%
            </p>
          ) : upload.phase === 'done' ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              Upload complete.
            </p>
          ) : null}
        </div>
        {upload.phase === 'error' ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {upload.message}
          </p>
        ) : null}
      </div>
      {documents.status === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading files&hellip;
        </p>
      ) : documents.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          Files couldn&rsquo;t be loaded.
        </p>
      ) : documents.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files shared yet.</p>
      ) : (
        <ul className="space-y-2">
          {documents.rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-danger-tint text-danger"
              >
                <FileText className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  {sizeLabel(row.sizeBytes)}
                  {row.uploadedAt !== null ? ` · ${DATE_FORMAT.format(row.uploadedAt)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openDocument(row.storagePath)}
                className="min-h-11 shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
