import { CLIENT_ALLOWED_DOCUMENT_MIME_TYPES } from '@siapp/shared';
import { useRef, useState } from 'react';

import {
  portalDownloadUrl,
  uploadPortalDocument,
  usePortalDocuments,
  validateClientFile,
  type TClientFileError,
} from './usePortalDocuments.ts';
import { usePortalSessionContext } from '../usePortalSession.ts';

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

type TUploadState =
  | { status: 'idle' }
  | { status: 'uploading'; percent: number }
  | { status: 'invalid'; reason: TClientFileError }
  | { status: 'failed' }
  | { status: 'done' };

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

/**
 * Portal documents page (B3, #21 D7): client-visible document list with
 * download links, plus a direct upload with progress, validation errors
 * (B2y) and a quarantine notice for infected files.
 */
export function PortalDocumentsPage() {
  const session = usePortalSessionContext();
  const state = usePortalDocuments(session.workspaceId, session.projectId);
  const [upload, setUpload] = useState<TUploadState>({ status: 'idle' });
  const lastFileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function startUpload(file: File): Promise<void> {
    const invalid = validateClientFile(file);
    if (invalid !== null) {
      setUpload({ status: 'invalid', reason: invalid });
      return;
    }
    lastFileRef.current = file;
    setUpload({ status: 'uploading', percent: 0 });
    try {
      await uploadPortalDocument({
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        clientId: session.clientId,
        file,
        onProgress: (percent) => setUpload({ status: 'uploading', percent }),
      });
      setUpload({ status: 'done' });
    } catch {
      setUpload({ status: 'failed' });
    }
  }

  async function handleDownload(storagePath: string): Promise<void> {
    try {
      const url = await portalDownloadUrl(storagePath);
      window.open(url, '_blank', 'noopener');
    } catch {
      // Transient — the button stays available to retry.
    }
  }

  return (
    <section aria-labelledby="documents-heading">
      <h1 id="documents-heading" className="text-2xl font-bold">
        Documents
      </h1>

      <div className="mt-4 rounded-lg border border-border p-4">
        <label htmlFor="portal-upload" className="text-sm font-medium">
          Share a file with your project team
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, images, or Word documents up to 10 MB.
        </p>
        <input
          ref={inputRef}
          id="portal-upload"
          type="file"
          accept={CLIENT_ALLOWED_DOCUMENT_MIME_TYPES.join(',')}
          disabled={upload.status === 'uploading'}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              void startUpload(file);
            }
            event.target.value = '';
          }}
          className="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
        />
        {upload.status === 'uploading' && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            Uploading… {upload.percent}%
          </p>
        )}
        {upload.status === 'done' && (
          <p role="status" className="mt-2 text-sm text-primary">
            File shared with your project team.
          </p>
        )}
        {upload.status === 'invalid' && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {INVALID_MESSAGES[upload.reason]}
          </p>
        )}
        {upload.status === 'failed' && (
          <div role="alert" className="mt-2 text-sm text-destructive">
            <p>The upload didn’t finish. Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => {
                const file = lastFileRef.current;
                if (file !== null) {
                  void startUpload(file);
                }
              }}
              className="mt-1 rounded-md border border-border px-3 py-1 text-sm font-medium text-foreground hover:bg-muted"
            >
              Retry upload
            </button>
          </div>
        )}
      </div>

      {state.status === 'loading' && (
        <p role="status" className="mt-4 text-muted-foreground">
          Loading documents&hellip;
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="mt-4 text-destructive">
          We couldn&rsquo;t load documents right now. Please try again shortly.
        </p>
      )}
      {state.status === 'ready' &&
        (state.rows.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No documents shared yet.
          </p>
        ) : (
          <ul aria-label="Shared documents" className="mt-4 space-y-2">
            {state.rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(row.sizeBytes)}
                    {row.uploadedAt !== null && ` · ${DATE_FORMAT.format(row.uploadedAt)}`}
                    {row.uploaderType === 'client' && ' · shared by you'}
                  </p>
                </div>
                {row.scanStatus === 'infected' ? (
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    Blocked by virus scan
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleDownload(row.storagePath)}
                    className="shrink-0 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Download
                    <span className="sr-only"> {row.name}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
