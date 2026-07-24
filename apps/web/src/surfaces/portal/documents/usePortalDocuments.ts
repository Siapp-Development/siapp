/**
 * Portal documents (#21, D7): live list of client-visible, non-deleted
 * document metadata plus a direct client-SDK upload — bytes to Storage under
 * client-uploads/, then the pinned metadata doc (rules force every identity
 * field). The onProjectDocumentWrite trigger derives the activity entry.
 */

import {
  CLIENT_ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_CLIENT_DOCUMENT_SIZE_BYTES,
} from '@siapp/shared';
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { useEffect, useState } from 'react';

import { db, storage } from '@/lib/firebase.ts';

export interface IPortalDocument {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date | null;
  uploaderType: string;
  scanStatus: string;
  storagePath: string;
}

export type TPortalDocumentsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IPortalDocument[] };

export type TClientFileError = 'too-large' | 'unsupported';

function mapDocument(id: string, data: DocumentData): IPortalDocument {
  return {
    id,
    name: String(data['name'] ?? ''),
    mimeType: String(data['mimeType'] ?? ''),
    sizeBytes: typeof data['sizeBytes'] === 'number' ? data['sizeBytes'] : 0,
    uploadedAt: data['uploadedAt'] instanceof Timestamp ? data['uploadedAt'].toDate() : null,
    uploaderType: String(data['uploaderType'] ?? ''),
    scanStatus: String(data['scanStatus'] ?? ''),
    storagePath: String(data['storagePath'] ?? ''),
  };
}

export function usePortalDocuments(
  workspaceId: string,
  projectId: string,
): TPortalDocumentsState {
  const [state, setState] = useState<TPortalDocumentsState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    // Equality filters only (rules-provable, no composite index); newest
    // first is sorted client-side.
    return onSnapshot(
      query(
        collection(db, `workspaces/${workspaceId}/projects/${projectId}/documents`),
        where('visibleToClient', '==', true),
        where('deletedAt', '==', null),
      ),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => mapDocument(docSnap.id, docSnap.data()));
        rows.sort((a, b) => (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0));
        setState({ status: 'ready', rows });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId, projectId]);

  return state;
}

/** Pre-upload validation mirroring the rules caps — null when acceptable. */
export function validateClientFile(file: {
  size: number;
  type: string;
}): TClientFileError | null {
  if (file.size > MAX_CLIENT_DOCUMENT_SIZE_BYTES) {
    return 'too-large';
  }
  if (!(CLIENT_ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'unsupported';
  }
  return null;
}

/** Resolves a short-lived download URL for a portal-readable object. */
export function portalDownloadUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath));
}

export async function uploadPortalDocument(options: {
  workspaceId: string;
  projectId: string;
  clientId: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const { workspaceId, projectId, clientId, file, onProgress } = options;
  const docId = crypto.randomUUID();
  const storagePath = `workspaces/${workspaceId}/projects/${projectId}/client-uploads/${docId}-${file.name}`;

  const task = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: file.type,
  });
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      reject,
      resolve,
    );
  });

  // Metadata after bytes — the pinned-field rules validate every value.
  await setDoc(doc(db, `workspaces/${workspaceId}/projects/${projectId}/documents/${docId}`), {
    id: docId,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    storagePath,
    scope: 'project',
    scopeId: projectId,
    uploadedBy: clientId,
    uploaderType: 'client',
    uploadedAt: Timestamp.now(),
    visibleToClient: true,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    scanStatus: 'pending',
    deletedAt: null,
  });
}
