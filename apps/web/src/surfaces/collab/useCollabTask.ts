/**
 * Live collab task data (#22): the pinned task doc, the collaborator's OWN
 * updates read-back (D-c — rules deny everything else), and the task-scoped
 * documents shared with this collaborator, plus the direct-upload path (D-f,
 * mirroring usePortalDocuments).
 */

import {
  COLLAB_ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_COLLAB_DOCUMENT_SIZE_BYTES,
  type TTaskStatus,
} from '@siapp/shared';
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { useEffect, useState } from 'react';

import { db, storage } from '@/lib/firebase.ts';

export interface ICollabTask {
  title: string;
  description: string;
  status: TTaskStatus;
  dueDate: Date | null;
  blockedReason: string;
  /** Rules force uploads to inherit these (D-029) — carried for the uploader. */
  visibleToClient: boolean;
  restrictedToDepartments: string[];
}

export type TCollabTaskState =
  | { status: 'loading' }
  // Covers soft revocation mid-session: unpublish/unassign/hide flips the
  // rules gate and the snapshot errors — the page shows the invalid state.
  | { status: 'gone' }
  | { status: 'ready'; task: ICollabTask };

function mapTask(data: DocumentData): ICollabTask {
  const status = data['status'];
  return {
    title: String(data['title'] ?? ''),
    description: String(data['description'] ?? ''),
    status:
      status === 'in_progress' || status === 'blocked' || status === 'done' ? status : 'todo',
    dueDate: data['dueDate'] instanceof Timestamp ? data['dueDate'].toDate() : null,
    blockedReason: typeof data['blockedReason'] === 'string' ? data['blockedReason'] : '',
    visibleToClient: data['visibleToClient'] === true,
    restrictedToDepartments: Array.isArray(data['restrictedToDepartments'])
      ? (data['restrictedToDepartments'] as unknown[]).filter(
          (d): d is string => typeof d === 'string',
        )
      : [],
  };
}

export function useCollabTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
): TCollabTaskState {
  const [state, setState] = useState<TCollabTaskState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      doc(db, `workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`),
      (snapshot) => {
        const data = snapshot.data();
        setState(data === undefined ? { status: 'gone' } : { status: 'ready', task: mapTask(data) });
      },
      () => setState({ status: 'gone' }),
    );
  }, [workspaceId, projectId, taskId]);

  return state;
}

export interface ICollabUpdate {
  id: string;
  action: string;
  text: string;
  to: string;
  createdAt: Date | null;
}

export type TCollabUpdatesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: ICollabUpdate[] };

function mapUpdate(id: string, data: DocumentData): ICollabUpdate {
  const payload = (data['payload'] ?? {}) as Record<string, unknown>;
  return {
    id,
    action: String(data['action'] ?? ''),
    text: typeof payload['text'] === 'string' ? payload['text'] : '',
    to: typeof payload['to'] === 'string' ? payload['to'] : '',
    createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : null,
  };
}

/** The collaborator's own updates, newest first (composite-indexed). */
export function useCollabUpdates(
  workspaceId: string,
  projectId: string,
  taskId: string,
  collaboratorId: string,
): TCollabUpdatesState {
  const [state, setState] = useState<TCollabUpdatesState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      query(
        collection(
          db,
          `workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/updates`,
        ),
        // authorId pin is what makes the rules list provable (D-c).
        where('authorId', '==', collaboratorId),
        orderBy('createdAt', 'desc'),
      ),
      (snapshot) => {
        setState({
          status: 'ready',
          rows: snapshot.docs.map((docSnap) => mapUpdate(docSnap.id, docSnap.data())),
        });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId, projectId, taskId, collaboratorId]);

  return state;
}

export interface ICollabDocument {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date | null;
  uploaderType: string;
  storagePath: string;
}

export type TCollabDocumentsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: ICollabDocument[] };

function mapDocument(id: string, data: DocumentData): ICollabDocument {
  return {
    id,
    name: String(data['name'] ?? ''),
    mimeType: String(data['mimeType'] ?? ''),
    sizeBytes: typeof data['sizeBytes'] === 'number' ? data['sizeBytes'] : 0,
    uploadedAt: data['uploadedAt'] instanceof Timestamp ? data['uploadedAt'].toDate() : null,
    uploaderType: String(data['uploaderType'] ?? ''),
    storagePath: String(data['storagePath'] ?? ''),
  };
}

/** Task-scoped documents shared with this collaborator, newest first. */
export function useCollabDocuments(
  workspaceId: string,
  projectId: string,
  taskId: string,
  collaboratorId: string,
): TCollabDocumentsState {
  const [state, setState] = useState<TCollabDocumentsState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    // All three constraints are required by the rules prover; newest first
    // is sorted client-side (no orderBy → no extra composite shape).
    return onSnapshot(
      query(
        collection(db, `workspaces/${workspaceId}/projects/${projectId}/documents`),
        where('scopeId', '==', taskId),
        where('visibleToCollaboratorIds', 'array-contains', collaboratorId),
        where('deletedAt', '==', null),
      ),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => mapDocument(docSnap.id, docSnap.data()));
        rows.sort((a, b) => (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0));
        setState({ status: 'ready', rows });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId, projectId, taskId, collaboratorId]);

  return state;
}

export type TCollabFileError = 'too-large' | 'unsupported';

/** Pre-upload validation mirroring the rules caps — null when acceptable. */
export function validateCollabFile(file: {
  size: number;
  type: string;
}): TCollabFileError | null {
  if (file.size > MAX_COLLAB_DOCUMENT_SIZE_BYTES) {
    return 'too-large';
  }
  if (!(COLLAB_ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'unsupported';
  }
  return null;
}

/** Resolves a short-lived download URL for a collab-readable object. */
export function collabDownloadUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath));
}

export async function uploadCollabDocument(options: {
  workspaceId: string;
  projectId: string;
  taskId: string;
  collaboratorId: string;
  /** The parent task's visibleToClient — rules force inheritance (D-029). */
  taskVisibleToClient: boolean;
  /** The parent task's restriction list — rules force the denorm copy. */
  taskRestrictedToDepartments: string[];
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const {
    workspaceId,
    projectId,
    taskId,
    collaboratorId,
    taskVisibleToClient,
    taskRestrictedToDepartments,
    file,
    onProgress,
  } = options;
  const docId = crypto.randomUUID();
  const storagePath = `workspaces/${workspaceId}/projects/${projectId}/collab-uploads/${docId}-${file.name}`;

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
    scope: 'task',
    scopeId: taskId,
    uploadedBy: collaboratorId,
    uploaderType: 'collaborator',
    uploadedAt: Timestamp.now(),
    visibleToClient: taskVisibleToClient,
    visibleToCollaboratorIds: [collaboratorId],
    restrictedToDepartments: taskRestrictedToDepartments,
    scanStatus: 'pending',
    deletedAt: null,
  });
}
