/**
 * Profile settings (#104): edit display name and profile photo. Reached from
 * the sidebar avatar and the Settings → Profile tab (visible to all roles).
 * Persistence (Storage upload + Auth updateProfile + Firestore mirror) lives in
 * `useUpdateProfile`; the live `users/{uid}` snapshot in AuthProvider reflects
 * the saved values back into `photoUrl`/`displayName` here.
 */

import { Alert, Avatar, Button, Card, CardContent, CardHeader, Input, Label } from '@siapp/ui';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { useUpdateProfile, validateAvatarFile } from './useUpdateProfile.ts';

export interface IProfileSettingsPageProps {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
}

export function ProfileSettingsPage({
  uid,
  email,
  displayName,
  photoUrl,
}: IProfileSettingsPageProps) {
  const { state, saveProfile, reset } = useUpdateProfile();
  const [name, setName] = useState(displayName);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL created for the local preview to avoid a leak.
  useEffect(() => {
    if (previewUrl === null) {
      return;
    }
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const nameLabel = name.trim() === '' ? (email === '' ? 'You' : email) : name;
  const shownPhoto = removePhoto ? null : (previewUrl ?? photoUrl ?? null);
  const hasExistingPhoto = typeof photoUrl === 'string' && photoUrl !== '';
  const canRemove = hasExistingPhoto || previewUrl !== null;
  const saving = state.status === 'saving';

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    reset();
    const file = event.target.files?.[0] ?? null;
    if (file === null) {
      return;
    }
    const validationError = validateAvatarFile(file);
    if (validationError !== null) {
      setFileError(validationError);
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    setFileError(null);
    setSelectedFile(file);
    setRemovePhoto(false);
    setPreviewUrl((current) => {
      if (current !== null) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });
  }

  function handleRemove(): void {
    reset();
    setFileError(null);
    setSelectedFile(null);
    setRemovePhoto(true);
    setPreviewUrl((current) => {
      if (current !== null) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await saveProfile({ displayName: name, photoFile: selectedFile, removePhoto });
    setSelectedFile(null);
    setRemovePhoto(false);
    setPreviewUrl((current) => {
      if (current !== null) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }

  const nameEmpty = name.trim() === '';

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update how your name and photo appear to your team.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Profile</h2>
        </CardHeader>
        <CardContent>
          {state.status === 'error' && (
            <Alert variant="destructive" className="mb-4">
              {state.message}
            </Alert>
          )}
          {state.status === 'success' && (
            <Alert className="mb-4" role="status">
              Your profile has been saved.
            </Alert>
          )}

          <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar size="lg" name={nameLabel} seed={uid} photoUrl={shownPhoto} />
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload photo
                  </Button>
                  {canRemove && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
                      Remove photo
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 5 MB.</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                aria-label="Profile photo"
                onChange={handleFileChange}
              />
            </div>
            {fileError !== null && (
              <Alert variant="destructive" role="alert">
                {fileError}
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-display-name">Display name</Label>
              <Input
                id="profile-display-name"
                value={name}
                required
                aria-invalid={nameEmpty}
                aria-describedby={nameEmpty ? 'profile-display-name-error' : undefined}
                onChange={(event) => {
                  reset();
                  setName(event.target.value);
                }}
                className="max-w-sm"
              />
              {nameEmpty && (
                <p id="profile-display-name-error" className="text-xs text-danger">
                  Display name is required.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={email} readOnly disabled className="max-w-sm" />
            </div>

            <div>
              <Button type="submit" disabled={saving || nameEmpty} aria-busy={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
