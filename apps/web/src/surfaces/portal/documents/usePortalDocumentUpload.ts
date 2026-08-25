/**
 * Shared client document upload (#126): validates and uploads a file to the
 * project's shared documents, tracking a small state machine. Used by both the
 * header "Upload Document" shortcut and the Documents section uploader, so the
 * upload logic lives in one place. Wraps validateClientFile /
 * uploadPortalDocument (unchanged) from usePortalDocuments.
 */

import { CLIENT_ALLOWED_DOCUMENT_MIME_TYPES } from '@siapp/shared';
import { useRef, useState, type ChangeEvent, type RefObject } from 'react';

import {
  uploadPortalDocument,
  validateClientFile,
  type TClientFileError,
} from './usePortalDocuments.ts';

export type TPortalUploadState =
  | { status: 'idle' }
  | { status: 'uploading'; percent: number }
  | { status: 'invalid'; reason: TClientFileError }
  | { status: 'failed' }
  | { status: 'done' };

export interface IUsePortalDocumentUploadParams {
  workspaceId: string;
  projectId: string;
  clientId: string;
}

export interface IPortalDocumentUpload {
  state: TPortalUploadState;
  /** Comma-separated accept list for the file input. */
  accept: string;
  /** Attach to a (hidden) file input the shortcut button opens. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Open the OS file picker via the attached input. */
  openPicker: () => void;
  /** onChange handler for a file input — validates and starts the upload. */
  handleInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Retry the last file after a failed upload. */
  retry: () => void;
}

export function usePortalDocumentUpload({
  workspaceId,
  projectId,
  clientId,
}: IUsePortalDocumentUploadParams): IPortalDocumentUpload {
  const [state, setState] = useState<TPortalUploadState>({ status: 'idle' });
  const lastFileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function startUpload(file: File): Promise<void> {
    const invalid = validateClientFile(file);
    if (invalid !== null) {
      setState({ status: 'invalid', reason: invalid });
      return;
    }
    lastFileRef.current = file;
    setState({ status: 'uploading', percent: 0 });
    try {
      await uploadPortalDocument({
        workspaceId,
        projectId,
        clientId,
        file,
        onProgress: (percent) => setState({ status: 'uploading', percent }),
      });
      setState({ status: 'done' });
    } catch {
      setState({ status: 'failed' });
    }
  }

  return {
    state,
    accept: CLIENT_ALLOWED_DOCUMENT_MIME_TYPES.join(','),
    inputRef,
    openPicker: () => inputRef.current?.click(),
    handleInputChange: (event) => {
      const file = event.target.files?.[0];
      if (file !== undefined) {
        void startUpload(file);
      }
      event.target.value = '';
    },
    retry: () => {
      const file = lastFileRef.current;
      if (file !== null) {
        void startUpload(file);
      }
    },
  };
}
