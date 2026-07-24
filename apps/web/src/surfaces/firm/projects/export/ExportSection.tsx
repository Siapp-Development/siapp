/**
 * Export project data card (#25) — project Details tab, owner/admin only.
 *
 * "Download JSON" invokes the exportProject callable (D1) and downloads the
 * versioned snapshot; the payload is cached in state so the per-entity CSV
 * buttons (D2) serialize locally without re-fetching. Documents are listed
 * from the payload with metadata only — "Get link" resolves a fresh Firebase
 * tokened URL via the client SDK (D3), disabled for soft-deleted (D6) and
 * infected files. Read-only workspaces can still export (D4).
 */

import type { IExportProjectResponse, TMemberRole } from '@siapp/shared';
import { Alert, Button, Card, CardContent, CardHeader } from '@siapp/ui';
import { getDownloadURL, ref } from 'firebase/storage';
import { useState } from 'react';

import { exportProject } from '@/lib/callables.ts';
import { storage } from '@/lib/firebase.ts';
import {
  activityToCsv,
  documentsToCsv,
  downloadBlob,
  exportFileName,
  payloadProjectName,
  tasksToCsv,
  updatesToCsv,
} from './exportCsv.ts';

export interface IExportSectionProps {
  workspaceId: string;
  projectId: string;
  role: TMemberRole;
}

type TCsvEntity = 'tasks' | 'updates' | 'activity' | 'documents';

const CSV_ENTITIES: Array<{ entity: TCsvEntity; label: string }> = [
  { entity: 'tasks', label: 'Tasks CSV' },
  { entity: 'updates', label: 'Updates CSV' },
  { entity: 'activity', label: 'Activity CSV' },
  { entity: 'documents', label: 'Documents CSV' },
];

function csvFor(payload: IExportProjectResponse, entity: TCsvEntity): string {
  switch (entity) {
    case 'tasks':
      return tasksToCsv(payload.tasks);
    case 'updates':
      return updatesToCsv(payload.tasks);
    case 'activity':
      return activityToCsv(payload.activity);
    case 'documents':
      return documentsToCsv(payload.documents);
  }
}

function docName(doc: Record<string, unknown>): string {
  return typeof doc['name'] === 'string' && doc['name'] !== '' ? doc['name'] : 'Unnamed file';
}

export function ExportSection({ workspaceId, projectId, role }: IExportSectionProps) {
  const [payload, setPayload] = useState<IExportProjectResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [docLinks, setDocLinks] = useState<Record<string, string>>({});

  // Server check is authoritative; this only hides the UI for pm/viewer.
  if (role !== 'owner' && role !== 'admin') {
    return null;
  }

  async function ensurePayload(): Promise<IExportProjectResponse> {
    if (payload !== null) {
      return payload;
    }
    const fresh = await exportProject({ workspaceId, projectId });
    setPayload(fresh);
    return fresh;
  }

  async function handleJson(): Promise<void> {
    setBusy('json');
    setError(null);
    setStatusMsg(null);
    try {
      const data = await ensurePayload();
      const date = data.exportedAt.slice(0, 10);
      downloadBlob(
        JSON.stringify(data, null, 2),
        exportFileName(payloadProjectName(data), `export-${date}.json`),
        'application/json',
      );
      setStatusMsg('JSON export downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export this project.');
    } finally {
      setBusy(null);
    }
  }

  async function handleCsv(entity: TCsvEntity): Promise<void> {
    setBusy(entity);
    setError(null);
    setStatusMsg(null);
    try {
      const data = await ensurePayload();
      downloadBlob(
        csvFor(data, entity),
        exportFileName(payloadProjectName(data), `${entity}.csv`),
        'text/csv;charset=utf-8',
      );
      setStatusMsg(`${entity}.csv downloaded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export this project.');
    } finally {
      setBusy(null);
    }
  }

  async function handleGetLink(docId: string, storagePath: string, name: string): Promise<void> {
    setBusy(`link:${docId}`);
    setError(null);
    setStatusMsg(null);
    try {
      const url = await getDownloadURL(ref(storage, storagePath));
      setDocLinks((links) => ({ ...links, [docId]: url }));
      setStatusMsg(`Download link ready for ${name}.`);
    } catch {
      setError(`Could not get a download link for ${name}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Export project data</h2>
        <p className="text-sm text-muted-foreground">
          Download everything in this project — tasks, updates, activity and document metadata.
          This file contains personal data; handle it per your PDPA obligations.
        </p>
      </CardHeader>
      <CardContent>
        {error !== null && (
          <Alert variant="destructive" className="mb-3">
            {error}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => void handleJson()}>
            {busy === 'json' ? 'Exporting…' : 'Download JSON'}
          </Button>
          {CSV_ENTITIES.map(({ entity, label }) => (
            <Button
              key={entity}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void handleCsv(entity)}
            >
              {busy === entity ? 'Exporting…' : label}
            </Button>
          ))}
        </div>
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {statusMsg}
        </p>

        {payload !== null && (
          <div className="mt-4">
            <h3 className="text-sm font-medium">Documents ({payload.documents.length})</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Files are not bundled in the export — get a fresh download link per file below or
              use the Documents tab.
            </p>
            {payload.documents.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {payload.documents.map((doc) => {
                  const name = docName(doc);
                  const storagePath = typeof doc['storagePath'] === 'string' ? doc['storagePath'] : '';
                  const infected = doc['scanStatus'] === 'infected';
                  const blocked = doc.deleted || infected || storagePath === '';
                  return (
                    <li key={doc.id} className="flex items-center gap-2 text-sm">
                      <span>
                        {name}
                        {doc.deleted && (
                          <span className="ml-1 text-muted-foreground">(deleted)</span>
                        )}
                        {infected && (
                          <span className="ml-1 text-destructive">(failed virus scan)</span>
                        )}
                      </span>
                      {docLinks[doc.id] !== undefined ? (
                        <a
                          href={docLinks[doc.id]}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          Open {name}
                        </a>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={blocked || busy !== null}
                          aria-label={`Get link for ${name}`}
                          onClick={() => void handleGetLink(doc.id, storagePath, name)}
                        >
                          Get link
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
