/**
 * Profile-edit persistence for the Profile settings screen (#104).
 *
 * A save fans out to three places so the new name/photo is consistent
 * everywhere:
 *   1. Firebase Storage — upload the photo to `avatars/{uid}/…` (owner-write,
 *      per storage.rules) and resolve its download URL.
 *   2. Firebase Auth — `updateProfile({ displayName, photoURL })` so the token
 *      user reflects the change.
 *   3. Firestore `users/{uid}` — mirror `{ displayName, photoUrl }` (rules
 *      already allow the owner). The `syncMemberProfile` trigger then fans the
 *      mirror out to every member doc so teammates see it.
 *
 * Removing a photo nulls the Auth `photoURL`, deletes the Firestore field, and
 * best-effort deletes the Storage object so bytes are freed.
 */

import { AVATAR_ALLOWED_MIME_TYPES, MAX_AVATAR_SIZE_BYTES } from '@siapp/shared';
import { updateProfile } from 'firebase/auth';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import { useCallback, useState } from 'react';

import { auth, db, storage } from '@/lib/firebase.ts';

const AVATAR_MIME_LABEL = 'PNG, JPEG or WebP';

/** Validate a candidate photo against the shared size/mime limits (client-side mirror of storage.rules). */
export function validateAvatarFile(file: File): string | null {
  if (!(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `Choose a ${AVATAR_MIME_LABEL} image.`;
  }
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    const maxMb = Math.round(MAX_AVATAR_SIZE_BYTES / (1024 * 1024));
    return `Image must be ${maxMb} MB or smaller.`;
  }
  return null;
}

export interface ISaveProfileInput {
  displayName: string;
  /** A new photo to upload; ignored when `removePhoto` is true. */
  photoFile: File | null;
  /** True to clear the existing photo. */
  removePhoto: boolean;
}

export type TProfileSaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export interface IUseUpdateProfile {
  state: TProfileSaveState;
  saveProfile: (input: ISaveProfileInput) => Promise<void>;
  reset: () => void;
}

/** Strip path separators so the object name stays a single, safe segment. */
function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function useUpdateProfile(): IUseUpdateProfile {
  const [state, setState] = useState<TProfileSaveState>({ status: 'idle' });

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  const saveProfile = useCallback(async (input: ISaveProfileInput): Promise<void> => {
    const user = auth.currentUser;
    if (user === null) {
      setState({ status: 'error', message: 'You are signed out. Sign in and try again.' });
      return;
    }

    const displayName = input.displayName.trim();
    if (displayName === '') {
      setState({ status: 'error', message: 'Enter a display name.' });
      return;
    }
    if (input.photoFile !== null && !input.removePhoto) {
      const fileError = validateAvatarFile(input.photoFile);
      if (fileError !== null) {
        setState({ status: 'error', message: fileError });
        return;
      }
    }

    setState({ status: 'saving' });
    try {
      // `undefined` = leave the current photo untouched; `null` = remove it.
      let nextPhotoUrl: string | null | undefined;

      if (input.removePhoto) {
        nextPhotoUrl = null;
        if (typeof user.photoURL === 'string' && user.photoURL !== '') {
          try {
            await deleteObject(storageRef(storage, user.photoURL));
          } catch {
            // Best-effort: the pointer is cleared below even if the object
            // (e.g. an external SSO photo, or an already-deleted file) can't
            // be removed here.
          }
        }
      } else if (input.photoFile !== null) {
        const path = `avatars/${user.uid}/${crypto.randomUUID()}-${safeFileName(input.photoFile.name)}`;
        const objectRef = storageRef(storage, path);
        await uploadBytes(objectRef, input.photoFile, { contentType: input.photoFile.type });
        nextPhotoUrl = await getDownloadURL(objectRef);
      }

      await updateProfile(user, {
        displayName,
        ...(nextPhotoUrl !== undefined ? { photoURL: nextPhotoUrl } : {}),
      });

      await updateDoc(doc(db, 'users', user.uid), {
        displayName,
        ...(nextPhotoUrl === undefined
          ? {}
          : { photoUrl: nextPhotoUrl === null ? deleteField() : nextPhotoUrl }),
      });

      setState({ status: 'success' });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not save your profile.',
      });
    }
  }, []);

  return { state, saveProfile, reset };
}
