/**
 * Pure CSV serializers for the #25 project export (D2: one CSV per entity,
 * derived client-side from the exportProject JSON payload).
 *
 * RFC-4180: fields containing commas, double quotes, CR or LF are wrapped in
 * double quotes with inner quotes doubled; rows join with CRLF. Files are
 * prefixed with a UTF-8 BOM so Excel detects the encoding. Values are read
 * defensively — export records are schemaless (`Record<string, unknown>`)
 * and older payloads may miss fields.
 */

import type {
  IExportDocumentRecord,
  IExportProjectResponse,
  IExportTaskRecord,
  TExportRecord,
} from '@siapp/shared';

/** UTF-8 byte-order mark — makes Excel open the file as UTF-8. */
export const CSV_BOM = '\ufeff';

/** RFC-4180 field escaping: quote when the value contains , " CR or LF. */
export function csvField(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : Array.isArray(value)
        ? value.map(String).join('; ')
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvDocument(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(','));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

function str(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  return typeof value === 'string' ? value : '';
}

const TASK_HEADER = [
  'id',
  'title',
  'status',
  'phaseId',
  'dueDate',
  'order',
  'description',
  'blockedReason',
  'restrictedToDepartments',
  'updateCount',
] as const;

export function tasksToCsv(tasks: readonly IExportTaskRecord[]): string {
  return csvDocument(
    TASK_HEADER,
    tasks.map((task) => [
      task.id,
      task['title'],
      task['status'],
      task['phaseId'],
      task['dueDate'],
      task['order'],
      task['description'],
      task['blockedReason'],
      task['restrictedToDepartments'],
      task.updates.length,
    ]),
  );
}

const UPDATE_HEADER = [
  'taskId',
  'taskTitle',
  'updateId',
  'action',
  'authorId',
  'authorName',
  'text',
  'from',
  'to',
  'createdAt',
] as const;

/** One row per task update, flattened from the nested streams. */
export function updatesToCsv(tasks: readonly IExportTaskRecord[]): string {
  return csvDocument(
    UPDATE_HEADER,
    tasks.flatMap((task) =>
      task.updates.map((update) => {
        const payload =
          typeof update['payload'] === 'object' && update['payload'] !== null
            ? (update['payload'] as Record<string, unknown>)
            : {};
        return [
          task.id,
          task['title'],
          update.id,
          update['action'],
          update['authorId'],
          update['authorNameDenorm'],
          payload['text'],
          payload['from'],
          payload['to'],
          update['createdAt'],
        ];
      }),
    ),
  );
}

const ACTIVITY_HEADER = [
  'id',
  'action',
  'actorType',
  'actorId',
  'actorName',
  'taskId',
  'taskTitle',
  'visibleToClient',
  'at',
] as const;

export function activityToCsv(activity: readonly TExportRecord[]): string {
  return csvDocument(
    ACTIVITY_HEADER,
    activity.map((entry) => [
      entry.id,
      entry['action'],
      entry['actorType'],
      entry['actorId'],
      entry['actorNameDenorm'],
      entry['taskId'],
      entry['taskTitleDenorm'],
      entry['visibleToClient'],
      entry['at'],
    ]),
  );
}

const DOCUMENT_HEADER = [
  'id',
  'name',
  'mimeType',
  'sizeBytes',
  'storagePath',
  'scope',
  'scopeId',
  'uploadedBy',
  'uploaderType',
  'uploadedAt',
  'visibleToClient',
  'scanStatus',
  'deleted',
  'deletedAt',
] as const;

/** Carries `storagePath`, not URLs — links are resolved fresh in the UI (D3). */
export function documentsToCsv(documents: readonly IExportDocumentRecord[]): string {
  return csvDocument(
    DOCUMENT_HEADER,
    documents.map((doc) => [
      doc.id,
      doc['name'],
      doc['mimeType'],
      doc['sizeBytes'],
      doc['storagePath'],
      doc['scope'],
      doc['scopeId'],
      doc['uploadedBy'],
      doc['uploaderType'],
      doc['uploadedAt'],
      doc['visibleToClient'],
      doc['scanStatus'],
      doc.deleted,
      doc['deletedAt'],
    ]),
  );
}

/** Filename-safe slug from a project name (fallback when empty). */
export function exportFileName(projectName: string, suffix: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'project' : slug}-${suffix}`;
}

/** Convenience: project name off the payload for filenames. */
export function payloadProjectName(payload: IExportProjectResponse): string {
  return str(payload.project, 'name');
}

/** Triggers a browser download of `content` via a temporary object URL. */
export function downloadBlob(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
