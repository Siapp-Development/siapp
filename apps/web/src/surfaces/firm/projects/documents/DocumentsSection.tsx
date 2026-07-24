/**
 * Documents tab body (#14): upload (owner/admin/pm) with client-side
 * size/mime pre-checks and a per-file options row (client visibility +
 * department restriction chips), plus the merged list of project- and
 * task-scoped documents with preview (PDF/images), download and soft delete.
 * Also exports the compact TaskAttachments block used by TaskDetailPanel —
 * task uploads inherit the task's restriction/visibility, no options row.
 */

import { Alert, Button, Card, CardContent, CardHeader, cn } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';
import { ALLOWED_DOCUMENT_MIME_TYPES, PREVIEWABLE_MIME_TYPES } from '@siapp/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useDepartments, useMembers } from '../../settings/useTeamData.ts';
import { DocumentPreview } from './DocumentPreview.tsx';
import { formatBytes } from './formatBytes.ts';
import {
  downloadDocument,
  getPreviewUrl,
  softDeleteDocument,
  uploadDocument,
  useDocuments,
  validateDocumentFile,
  type IDocumentRow,
} from './useDocuments.ts';

const FILE_INPUT_ACCEPT = ALLOWED_DOCUMENT_MIME_TYPES.join(',');

function isPreviewable(mimeType: string): boolean {
  return (PREVIEWABLE_MIME_TYPES as readonly string[]).includes(mimeType);
}

// ---------------------------------------------------------------------------
// Shared upload button (hidden file input + pre-check)
// ---------------------------------------------------------------------------

interface IUploadButtonProps {
  label: string;
  disabled: boolean;
  onPick: (file: File) => void;
  onInvalid: (message: string) => void;
}

function UploadButton({ label, disabled, onPick, onInvalid }: IUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        className="hidden"
        data-testid="document-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file === undefined) {
            return;
          }
          const problem = validateDocumentFile(file);
          if (problem !== null) {
            onInvalid(problem);
            return;
          }
          onPick(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Document list row
// ---------------------------------------------------------------------------

interface IDocumentRowItemProps {
  row: IDocumentRow;
  uploaderName: string;
  departmentNames: Map<string, string>;
  canEdit: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

function DocumentRowItem({
  row,
  uploaderName,
  departmentNames,
  canEdit,
  onPreview,
  onDownload,
  onDelete,
}: IDocumentRowItemProps) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-sm hover:bg-muted">
      <span className="min-w-40 flex-1 font-medium">{row.name}</span>
      <span className="text-xs text-muted-foreground">{formatBytes(row.sizeBytes)}</span>
      <span className="text-xs text-muted-foreground">
        {uploaderName}
        {row.uploadedAt !== null && ` · ${row.uploadedAt.toLocaleDateString()}`}
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        {row.scope === 'task' ? 'Task' : 'Project'}
      </span>
      {row.restrictedToDepartments.length > 0 && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          Restricted ·{' '}
          {row.restrictedToDepartments.map((dep) => departmentNames.get(dep) ?? dep).join(', ')}
        </span>
      )}
      {row.scanStatus === 'pending' && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          Scan pending
        </span>
      )}
      <span className="flex gap-1">
        {isPreviewable(row.mimeType) && (
          <Button type="button" variant="ghost" size="sm" onClick={onPreview}>
            Preview
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDownload}>
          Download
        </Button>
        {canEdit && (
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Documents tab
// ---------------------------------------------------------------------------

export interface IDocumentsSectionProps {
  workspaceId: string;
  projectId: string;
  role: TMemberRole;
  departments: string[];
  uid: string;
  userName: string;
  canEdit: boolean;
}

export function DocumentsSection({
  workspaceId,
  projectId,
  role,
  departments,
  uid,
  userName,
  canEdit,
}: IDocumentsSectionProps) {
  const docsState = useDocuments(workspaceId, projectId, role, departments);
  const membersState = useMembers(workspaceId);
  const departmentsState = useDepartments(workspaceId);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [restrictedTo, setRestrictedTo] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ row: IDocumentRow; url: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<IDocumentRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    return () => {
      if (preview !== null) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  const departmentRows = useMemo(
    () => (departmentsState.status === 'ready' ? departmentsState.rows : []),
    [departmentsState],
  );
  const departmentNames = useMemo(
    () => new Map(departmentRows.map((dep) => [dep.id, dep.name])),
    [departmentRows],
  );
  const memberNames = useMemo(
    () =>
      new Map(
        (membersState.status === 'ready' ? membersState.rows : []).map((member) => [
          member.uid,
          member.displayName,
        ]),
      ),
    [membersState],
  );
  // A pm can only restrict to departments they belong to (rules parity with
  // tasks — you cannot restrict a document into invisibility).
  const selectableDepartments =
    role === 'owner' || role === 'admin'
      ? departmentRows
      : departmentRows.filter((dep) => departments.includes(dep.id));

  function resetUpload(): void {
    setPendingFile(null);
    setVisibleToClient(false);
    setRestrictedTo([]);
    setProgress(null);
  }

  async function handleUpload(): Promise<void> {
    if (pendingFile === null) {
      return;
    }
    setProgress(0);
    setError(null);
    try {
      await uploadDocument({
        workspaceId,
        projectId,
        file: pendingFile,
        scope: 'project',
        scopeId: projectId,
        visibleToClient,
        restrictedToDepartments: restrictedTo,
        uid,
        userName,
        onProgress: setProgress,
      });
      resetUpload();
    } catch {
      setError('Could not upload the file.');
      setProgress(null);
    }
  }

  async function openPreview(row: IDocumentRow): Promise<void> {
    setError(null);
    try {
      const url = await getPreviewUrl(row.storagePath);
      setPreview((prev) => {
        if (prev !== null) {
          URL.revokeObjectURL(prev.url);
        }
        return { row, url };
      });
    } catch {
      setError('Could not load the preview.');
    }
  }

  async function handleDelete(row: IDocumentRow): Promise<void> {
    setDeletePending(true);
    setError(null);
    try {
      await softDeleteDocument(workspaceId, projectId, row, uid, userName);
      setConfirmingDelete(null);
    } catch {
      setError('Could not delete the document.');
    } finally {
      setDeletePending(false);
    }
  }

  if (docsState.status === 'loading') {
    return <p className="text-sm">Loading documents…</p>;
  }
  if (docsState.status === 'error') {
    return <Alert variant="destructive">Documents could not be loaded.</Alert>;
  }

  const uploading = progress !== null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-lg font-semibold">Documents</h2>
          {canEdit && pendingFile === null && (
            <UploadButton
              label="Upload document"
              disabled={false}
              onPick={(file) => {
                setError(null);
                setPendingFile(file);
              }}
              onInvalid={setError}
            />
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error !== null && <Alert variant="destructive">{error}</Alert>}

          {pendingFile !== null && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">
                {pendingFile.name}{' '}
                <span className="font-normal text-muted-foreground">
                  ({formatBytes(pendingFile.size)})
                </span>
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={visibleToClient}
                  disabled={uploading}
                  onChange={(event) => setVisibleToClient(event.target.checked)}
                />
                Client can see this document
              </label>
              {selectableDepartments.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-muted-foreground">
                    Restrict to departments (empty = visible to the whole team)
                  </p>
                  <ul className="flex flex-wrap gap-1">
                    {selectableDepartments.map((dep) => (
                      <li key={dep.id}>
                        <button
                          type="button"
                          aria-pressed={restrictedTo.includes(dep.id)}
                          disabled={uploading}
                          onClick={() =>
                            setRestrictedTo((prev) =>
                              prev.includes(dep.id)
                                ? prev.filter((id) => id !== dep.id)
                                : [...prev, dep.id],
                            )
                          }
                          className={cn(
                            'rounded-full border border-border px-2 py-0.5 text-xs',
                            restrictedTo.includes(dep.id)
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {dep.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {uploading && (
                <progress
                  value={progress}
                  max={1}
                  aria-label="Upload progress"
                  className="h-2 w-full"
                />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={uploading}
                  onClick={() => void handleUpload()}
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={resetUpload}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {docsState.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {docsState.rows.map((row) => (
                <DocumentRowItem
                  key={row.id}
                  row={row}
                  uploaderName={memberNames.get(row.uploadedBy) ?? row.uploadedBy}
                  departmentNames={departmentNames}
                  canEdit={canEdit}
                  onPreview={() => void openPreview(row)}
                  onDownload={() => void downloadDocument(row.storagePath, row.name)}
                  onDelete={() => setConfirmingDelete(row)}
                />
              ))}
            </ul>
          )}

          {confirmingDelete !== null && (
            <Alert variant="destructive">
              <p className="text-sm font-medium">Delete “{confirmingDelete.name}”?</p>
              <p className="mt-1 text-sm">It disappears from the list for everyone.</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={deletePending}
                  onClick={() => void handleDelete(confirmingDelete)}
                >
                  {deletePending ? 'Deleting…' : 'Delete document'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDelete(null)}
                >
                  Cancel
                </Button>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>

      {preview !== null && (
        <DocumentPreview
          name={preview.row.name}
          mimeType={preview.row.mimeType}
          url={preview.url}
          onClose={() => {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact attachments block for TaskDetailPanel — uploads inherit the task's
// restriction/visibility (no options row), list is download-only.
// ---------------------------------------------------------------------------

export interface ITaskAttachmentsProps {
  workspaceId: string;
  projectId: string;
  taskId: string;
  taskVisibleToClient: boolean;
  taskRestrictedToDepartments: string[];
  role: TMemberRole;
  departments: string[];
  uid: string;
  userName: string;
  canEdit: boolean;
}

export function TaskAttachments({
  workspaceId,
  projectId,
  taskId,
  taskVisibleToClient,
  taskRestrictedToDepartments,
  role,
  departments,
  uid,
  userName,
  canEdit,
}: ITaskAttachmentsProps) {
  const filter = useMemo(() => ({ scope: 'task' as const, scopeId: taskId }), [taskId]);
  const docsState = useDocuments(workspaceId, projectId, role, departments, filter);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(file: File): Promise<void> {
    setProgress(0);
    setError(null);
    try {
      await uploadDocument({
        workspaceId,
        projectId,
        file,
        scope: 'task',
        scopeId: taskId,
        visibleToClient: taskVisibleToClient,
        restrictedToDepartments: taskRestrictedToDepartments,
        uid,
        userName,
        onProgress: setProgress,
      });
    } catch {
      setError('Could not upload the file.');
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Attachments</p>
        {canEdit && (
          <UploadButton
            label={progress !== null ? 'Uploading…' : 'Attach file'}
            disabled={progress !== null}
            onPick={(file) => void handlePick(file)}
            onInvalid={setError}
          />
        )}
      </div>
      {error !== null && <Alert variant="destructive">{error}</Alert>}
      {docsState.status === 'error' && (
        <Alert variant="destructive">Attachments could not be loaded.</Alert>
      )}
      {docsState.status === 'ready' && docsState.rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      )}
      {docsState.status === 'ready' && docsState.rows.length > 0 && (
        <ul className="flex flex-col gap-1">
          {docsState.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="min-w-32 flex-1">{row.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(row.sizeBytes)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void downloadDocument(row.storagePath, row.name)}
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
