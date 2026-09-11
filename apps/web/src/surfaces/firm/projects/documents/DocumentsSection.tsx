/**
 * Documents tab body (#14): upload (owner/admin/pm) with client-side
 * size/mime pre-checks and a per-file options row (client visibility +
 * department restriction chips), plus the merged list of project- and
 * task-scoped documents with preview (PDF/images), download and soft delete.
 * Also exports the compact TaskAttachments block used by TaskDetailPanel —
 * task uploads inherit the task's restriction/visibility, no options row.
 */

import { Alert, Button, Card, CardContent, CardHeader, Dialog, Input, Label, cn } from '@siapp/ui';
import type { IButtonProps } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';
import { ALLOWED_DOCUMENT_MIME_TYPES, PREVIEWABLE_MIME_TYPES } from '@siapp/shared';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Download, ExternalLink, FileText, Upload, X } from 'lucide-react';

import { useDepartments, useMembers } from '../../settings/useTeamData.ts';
import { DocumentPreview } from './DocumentPreview.tsx';
import { formatBytes } from './formatBytes.ts';
import {
  addLinkAttachment,
  downloadDocument,
  getPreviewUrl,
  softDeleteDocument,
  uploadDocument,
  useDocuments,
  validateDocumentFile,
  validateDriveUrl,
  type IDocumentRow,
} from './useDocuments.ts';
import { isZipContentType } from './zip.ts';

const FILE_INPUT_ACCEPT = `${ALLOWED_DOCUMENT_MIME_TYPES.join(',')},.dwg`;

function isPreviewable(mimeType: string): boolean {
  return (PREVIEWABLE_MIME_TYPES as readonly string[]).includes(mimeType) || isZipContentType(mimeType);
}

// ---------------------------------------------------------------------------
// Shared upload button (hidden file input + pre-check)
// ---------------------------------------------------------------------------

interface IUploadButtonProps {
  label: string;
  disabled: boolean;
  onPick: (file: File) => void;
  onInvalid: (message: string) => void;
  /** When provided, render an icon-only button using `label` as its aria-label. */
  icon?: ReactNode;
  /** Leading icon shown before `label` in text mode (ignored when `icon` set). */
  leadingIcon?: ReactNode;
  /** Button style variant for text mode (default 'outline'). */
  variant?: IButtonProps['variant'];
  /** Extra classes for text mode (e.g. `flex-1 border-dashed`). */
  className?: string;
}

function UploadButton({
  label,
  disabled,
  onPick,
  onInvalid,
  icon,
  leadingIcon,
  variant = 'outline',
  className,
}: IUploadButtonProps) {
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
      {icon !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {icon}
        </Button>
      ) : (
        <Button
          type="button"
          variant={variant}
          size="sm"
          className={className}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {leadingIcon}
          {label}
        </Button>
      )}
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
  const isLink = row.attachmentType === 'link';
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-sm hover:bg-muted">
      <span className="min-w-40 flex-1 font-medium">{row.name}</span>
      <span className="text-xs text-muted-foreground">
        {isLink ? 'Google Drive link' : formatBytes(row.sizeBytes)}
      </span>
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
      {!isLink && row.scanStatus === 'pending' && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          Scan pending
        </span>
      )}
      <span className="flex gap-1">
        {isLink ? (
          <Button asChild variant="ghost" size="sm">
            <a href={row.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open
            </a>
          </Button>
        ) : (
          <>
            {isPreviewable(row.mimeType) && (
              <Button type="button" variant="ghost" size="sm" onClick={onPreview}>
                Preview
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onDownload}>
              Download
            </Button>
          </>
        )}
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
// Google Drive brand mark (D-043) — inline multicolour SVG. Decorative
// (aria-hidden); the button/label carries the accessible name. Sized via
// `className` from the caller.
// ---------------------------------------------------------------------------

function GoogleDriveIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 87.3 78"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
        fill="#ea4335"
      />
      <path
        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Add-a-Drive-link dialog (D-043) — paste a Google Drive share URL, attach it
// as a link-type document. No bytes are uploaded. Visibility inherits from the
// task via the caller's `onSubmit`.
// ---------------------------------------------------------------------------

interface IAddDriveLinkDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: { url: string; name: string }) => Promise<void>;
}

/** Derive a friendly default display name from a Drive URL's last path segment. */
function deriveLinkName(rawUrl: string): string {
  try {
    const { pathname } = new URL(rawUrl.trim());
    const segments = pathname.split('/').filter((seg) => seg.length > 0);
    const last = segments.at(-1);
    if (last !== undefined && last !== 'view' && last !== 'edit') {
      // Cap to the rules' 255-char `name` limit — URLs allow up to 2000 chars,
      // and a decoded segment can still exceed 255 (D-043 post-submit reject).
      return decodeURIComponent(last).slice(0, 255);
    }
  } catch {
    // Fall through to the generic label for unparseable input.
  }
  return 'Google Drive file';
}

function AddDriveLinkDialog({ open, onClose, onSubmit }: IAddDriveLinkDialogProps) {
  const headingId = useId();
  const urlFieldId = useId();
  const nameFieldId = useId();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the dialog opens so a re-open starts clean.
  useEffect(() => {
    if (open) {
      setUrl('');
      setName('');
      setTouched(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const validationMessage = validateDriveUrl(url);
  const showValidation = touched && validationMessage !== null;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setTouched(true);
    if (validationMessage !== null) {
      return;
    }
    const trimmedName = name.trim();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        url: url.trim(),
        name: trimmedName === '' ? deriveLinkName(url) : trimmedName,
      });
      onClose();
    } catch {
      setError('Could not attach the link.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={headingId}>
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
            <GoogleDriveIcon className="h-5 w-5" />
            Attach a Google Drive link
          </h2>
          <p className="text-sm text-muted-foreground">
            Paste a Drive share link. Make sure its sharing is set so your recipients can open it.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={urlFieldId}>
            Google Drive link
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </Label>
          <Input
            id={urlFieldId}
            type="url"
            inputMode="url"
            required
            placeholder="https://drive.google.com/…"
            value={url}
            aria-invalid={showValidation}
            aria-describedby={showValidation ? `${urlFieldId}-error` : undefined}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          {showValidation && (
            <p id={`${urlFieldId}-error`} className="text-xs text-danger">
              {validationMessage}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameFieldId}>Display name (optional)</Label>
          <Input
            id={nameFieldId}
            type="text"
            maxLength={255}
            placeholder="Google Drive file"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        {error !== null && <Alert variant="destructive">{error}</Alert>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting || validationMessage !== null}>
            {submitting ? 'Attaching…' : 'Attach'}
          </Button>
        </div>
      </form>
    </Dialog>
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
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const rows = docsState.status === 'ready' ? docsState.rows : [];
  const count = rows.length;

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

  async function handleAddLink(values: { url: string; name: string }): Promise<void> {
    await addLinkAttachment({
      workspaceId,
      projectId,
      taskId,
      url: values.url,
      name: values.name,
      visibleToClient: taskVisibleToClient,
      restrictedToDepartments: taskRestrictedToDepartments,
      uid,
      userName,
    });
  }

  async function handleRemove(row: IDocumentRow): Promise<void> {
    setRemovingId(row.id);
    setError(null);
    try {
      await softDeleteDocument(workspaceId, projectId, row, uid, userName);
    } catch {
      setError('Could not remove the attachment.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Attachments</p>
        {docsState.status === 'ready' && (
          <span className="text-xs text-muted-foreground">
            {count} {count === 1 ? 'file' : 'files'}
          </span>
        )}
      </div>
      {error !== null && <Alert variant="destructive">{error}</Alert>}
      {docsState.status === 'error' && (
        <Alert variant="destructive">Attachments could not be loaded.</Alert>
      )}
      {docsState.status === 'ready' && count === 0 && (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      )}
      {docsState.status === 'ready' && count > 0 && (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <TaskAttachmentRow
              key={row.id}
              row={row}
              canEdit={canEdit}
              removing={removingId === row.id}
              onRemove={() => void handleRemove(row)}
            />
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex gap-2">
          <UploadButton
            label={progress !== null ? 'Uploading…' : 'Upload File'}
            leadingIcon={<Upload className="h-4 w-4" aria-hidden="true" />}
            className="flex-1 border-dashed"
            disabled={progress !== null}
            onPick={(file) => void handlePick(file)}
            onInvalid={setError}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setLinkDialogOpen(true)}
          >
            <GoogleDriveIcon className="h-4 w-4" />
            Google Drive
          </Button>
        </div>
      )}
      {canEdit && (
        <AddDriveLinkDialog
          open={linkDialogOpen}
          onClose={() => setLinkDialogOpen(false)}
          onSubmit={handleAddLink}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single attachment row for TaskAttachments — file rows show size + download;
// link rows show a provider label + external "Open" link (D-043). Both carry
// an accessible `×` remove control when the caller can edit.
// ---------------------------------------------------------------------------

interface ITaskAttachmentRowProps {
  row: IDocumentRow;
  canEdit: boolean;
  removing: boolean;
  onRemove: () => void;
}

function TaskAttachmentRow({ row, canEdit, removing, onRemove }: ITaskAttachmentRowProps) {
  const isLink = row.attachmentType === 'link';
  return (
    <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
      <span className="text-muted-foreground" aria-hidden="true">
        {isLink ? (
          <GoogleDriveIcon className="h-4 w-4" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{row.name}</span>
        <span className="text-xs text-muted-foreground">
          {isLink
            ? 'Google Drive link'
            : `${formatBytes(row.sizeBytes)}${
                row.uploadedAt !== null ? ` • Uploaded ${row.uploadedAt.toLocaleDateString()}` : ''
              }`}
        </span>
      </span>
      {isLink ? (
        <Button asChild variant="ghost" size="sm">
          <a href={row.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open
          </a>
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Download"
          onClick={() => void downloadDocument(row.storagePath, row.name)}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${row.name}`}
          disabled={removing}
          onClick={onRemove}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}
