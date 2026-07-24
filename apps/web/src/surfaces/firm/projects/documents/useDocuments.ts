/**
 * Live Firestore subscriptions + Storage-backed writers for the documents
 * surface (#14). Uploads go straight to Cloud Storage via the client SDK
 * (storage.rules enforce membership/size/mime) and metadata is written to
 * `documents/{did}` in a batch; removal is a Firestore soft delete (bytes
 * stay in Storage for retention).
 *
 * Department need-to-know follows the useTasks merged-query pattern: rules
 * prove list queries, so pm/viewer get one query for unrestricted docs plus
 * one `array-contains` query per claim department, deduped by id. Every
 * query filters `deletedAt == null` (written as an explicit null at create).
 */

import type { TMemberRole, TScanStatus, TUploaderType } from '@siapp/shared';
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from '@siapp/shared';
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { getBlob, ref, uploadBytesResumable } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';

import { db, storage } from '@/lib/firebase.ts';

// ---------------------------------------------------------------------------
// Row type + mapping
// ---------------------------------------------------------------------------

export interface IDocumentRow {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  scope: 'project' | 'task';
  scopeId: string;
  uploadedBy: string;
  uploaderType: TUploaderType;
  uploadedAt: Date | null;
  visibleToClient: boolean;
  restrictedToDepartments: string[];
  scanStatus: TScanStatus;
}

export type TDocumentsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IDocumentRow[] };

function asDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function mapDocument(id: string, data: DocumentData): IDocumentRow {
  return {
    id,
    name: String(data['name'] ?? ''),
    mimeType: String(data['mimeType'] ?? ''),
    sizeBytes: typeof data['sizeBytes'] === 'number' ? data['sizeBytes'] : 0,
    storagePath: String(data['storagePath'] ?? ''),
    scope: data['scope'] === 'task' ? 'task' : 'project',
    scopeId: String(data['scopeId'] ?? ''),
    uploadedBy: String(data['uploadedBy'] ?? ''),
    uploaderType: (data['uploaderType'] ?? 'firm_member') as TUploaderType,
    uploadedAt: asDate(data['uploadedAt']),
    visibleToClient: data['visibleToClient'] === true,
    restrictedToDepartments: asStringArray(data['restrictedToDepartments']),
    scanStatus: (data['scanStatus'] ?? 'pending') as TScanStatus,
  };
}

function newestFirst(a: IDocumentRow, b: IDocumentRow): number {
  return (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0) || a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface IDocumentsFilter {
  scope: 'project' | 'task';
  scopeId: string;
}

export function useDocuments(
  workspaceId: string,
  projectId: string,
  role: TMemberRole,
  departments: string[],
  filter?: IDocumentsFilter,
): TDocumentsState {
  const docsPath = `workspaces/${workspaceId}/projects/${projectId}/documents`;
  const seesEverything = role === 'owner' || role === 'admin';
  // Stable keys so the effect doesn't resubscribe on every render.
  const departmentsKey = departments.join('\u0000');
  const filterScope = filter?.scope ?? null;
  const filterScopeId = filter?.scopeId ?? null;

  const [docsByQuery, setDocsByQuery] = useState<Map<number, IDocumentRow[]> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDocsByQuery(null);
    setFailed(false);
    const scopeClauses =
      filterScope !== null && filterScopeId !== null
        ? [where('scope', '==', filterScope), where('scopeId', '==', filterScopeId)]
        : [];
    const base = collection(db, docsPath);
    const notDeleted = where('deletedAt', '==', null);
    const deps = departmentsKey === '' ? [] : departmentsKey.split('\u0000');
    const queries: Query[] = seesEverything
      ? [query(base, notDeleted, ...scopeClauses)]
      : [
          query(base, notDeleted, where('restrictedToDepartments', '==', []), ...scopeClauses),
          ...deps.map((dep) =>
            query(
              base,
              notDeleted,
              where('restrictedToDepartments', 'array-contains', dep),
              ...scopeClauses,
            ),
          ),
        ];
    const unsubscribes = queries.map((q, index) =>
      onSnapshot(
        q,
        (snapshot) => {
          const rows = snapshot.docs.map((docSnap) => mapDocument(docSnap.id, docSnap.data()));
          setDocsByQuery((prev) => {
            const next = new Map(prev ?? []);
            next.set(index, rows);
            return next;
          });
        },
        () => setFailed(true),
      ),
    );
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [docsPath, seesEverything, departmentsKey, filterScope, filterScopeId]);

  const expectedQueryCount = seesEverything
    ? 1
    : 1 + (departmentsKey === '' ? 0 : departmentsKey.split('\u0000').length);

  return useMemo(() => {
    if (failed) {
      return { status: 'error' as const };
    }
    if (docsByQuery === null || docsByQuery.size < expectedQueryCount) {
      return { status: 'loading' as const };
    }
    const byId = new Map<string, IDocumentRow>();
    for (const rows of docsByQuery.values()) {
      for (const row of rows) {
        byId.set(row.id, row);
      }
    }
    return { status: 'ready' as const, rows: [...byId.values()].sort(newestFirst) };
  }, [docsByQuery, failed, expectedQueryCount]);
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

export interface IUploadDocumentInput {
  workspaceId: string;
  projectId: string;
  file: File;
  scope: 'project' | 'task';
  scopeId: string;
  visibleToClient: boolean;
  restrictedToDepartments: string[];
  uid: string;
  userName: string;
  onProgress?: (fraction: number) => void;
}

/** Client-side pre-check mirror of the storage/firestore rules. */
export function validateDocumentFile(file: File): string | null {
  if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'This file type is not supported.';
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return 'Files must be 25 MB or smaller.';
  }
  if (file.size === 0) {
    return 'This file is empty.';
  }
  return null;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(0, 120);
}

export async function uploadDocument(input: IUploadDocumentInput): Promise<void> {
  const { workspaceId, projectId, file } = input;
  const storagePath = `workspaces/${workspaceId}/projects/${projectId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

  const upload = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: file.type,
  });
  await new Promise<void>((resolve, reject) => {
    upload.on(
      'state_changed',
      (snapshot) => {
        input.onProgress?.(
          snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0,
        );
      },
      reject,
      resolve,
    );
  });

  // If this batch fails after the bytes landed, the object is orphaned in
  // Storage — accepted at MVP (GC follow-up), the metadata doc never exists.
  const batch = writeBatch(db);
  const docRef = doc(collection(db, `workspaces/${workspaceId}/projects/${projectId}/documents`));
  batch.set(docRef, {
    id: docRef.id,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    storagePath,
    scope: input.scope,
    scopeId: input.scopeId,
    uploadedBy: input.uid,
    uploaderType: 'firm_member',
    uploadedAt: serverTimestamp(),
    visibleToClient: input.visibleToClient,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: input.restrictedToDepartments,
    scanStatus: 'pending',
    deletedAt: null,
  });
  if (input.scope === 'task') {
    appendDocActivity(batch, input.workspaceId, input.projectId, input.scopeId, 'doc_added', {
      name: file.name,
      storagePath,
      mimeType: file.type,
      uid: input.uid,
      userName: input.userName,
    });
  }
  await batch.commit();
}

interface IDocActivityInput {
  name: string;
  storagePath: string;
  mimeType: string;
  uid: string;
  userName: string;
}

function appendDocActivity(
  batch: ReturnType<typeof writeBatch>,
  workspaceId: string,
  projectId: string,
  taskId: string,
  action: 'doc_added' | 'doc_deleted',
  input: IDocActivityInput,
): void {
  const ref = doc(
    collection(db, `workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/updates`),
  );
  batch.set(ref, {
    id: ref.id,
    authorType: 'user',
    authorId: input.uid,
    authorNameDenorm: input.userName,
    source: 'web',
    action,
    payload: { text: input.name, storagePath: input.storagePath, mimeType: input.mimeType },
    createdAt: serverTimestamp(),
  });
}

export async function softDeleteDocument(
  workspaceId: string,
  projectId: string,
  row: IDocumentRow,
  uid: string,
  userName: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, `workspaces/${workspaceId}/projects/${projectId}/documents/${row.id}`), {
    deletedAt: serverTimestamp(),
    deletedBy: uid,
    deletedByType: 'firm_member',
  });
  if (row.scope === 'task') {
    appendDocActivity(batch, workspaceId, projectId, row.scopeId, 'doc_deleted', {
      name: row.name,
      storagePath: row.storagePath,
      mimeType: row.mimeType,
      uid,
      userName,
    });
  }
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Download / preview (rules-enforced getBlob — production bucket needs CORS
// configured for the app origin; noted in the #14 PR)
// ---------------------------------------------------------------------------

export async function downloadDocument(storagePath: string, name: string): Promise<void> {
  const blob = await getBlob(ref(storage, storagePath));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Returns an object URL for inline preview — the caller must revoke it. */
export async function getPreviewUrl(storagePath: string): Promise<string> {
  const blob = await getBlob(ref(storage, storagePath));
  return URL.createObjectURL(blob);
}
