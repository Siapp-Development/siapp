import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileSettingsPage } from './ProfileSettingsPage.tsx';
import type { TProfileSaveState } from './useUpdateProfile.ts';

// The persistence hook talks to Firebase; the page is tested against a
// controllable fake while the real, pure `validateAvatarFile` is preserved so
// mime/size validation is exercised for real.
const hook = vi.hoisted(() => ({
  state: { status: 'idle' } as TProfileSaveState,
  saveProfile: vi.fn(async () => {}),
  reset: vi.fn(),
}));

vi.mock('@/lib/firebase.ts', () => ({ auth: {}, db: {}, storage: {} }));

vi.mock('./useUpdateProfile.ts', async (importActual) => {
  const actual = await importActual<typeof import('./useUpdateProfile.ts')>();
  return { ...actual, useUpdateProfile: () => hook };
});

const DEFAULT_PROPS = {
  uid: 'u1',
  email: 'ada@firm.test',
  displayName: 'Ada Lovelace',
};

function renderPage(props: Partial<typeof DEFAULT_PROPS> & { photoUrl?: string } = {}) {
  return render(<ProfileSettingsPage {...DEFAULT_PROPS} {...props} />);
}

function pngFile(name = 'me.png', bytes = 10): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

beforeEach(() => {
  hook.state = { status: 'idle' };
  hook.saveProfile.mockClear();
  hook.reset.mockClear();
  // jsdom lacks object-URL support used by the local preview.
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProfileSettingsPage', () => {
  it('renders the profile form with the display name and read-only email', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Your profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('Ada Lovelace');
    const email = screen.getByLabelText('Email');
    expect(email).toHaveValue('ada@firm.test');
    expect(email).toBeDisabled();
  });

  it('shows a required-name error and disables Save when the name is empty', async () => {
    renderPage();

    await userEvent.clear(screen.getByLabelText('Display name'));

    expect(screen.getByText('Display name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('rejects a disallowed file type with an accessible error and no save', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Profile photo'), {
      target: { files: [new File(['x'], 'evil.gif', { type: 'image/gif' })] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a PNG, JPEG or WebP image.');
    expect(hook.saveProfile).not.toHaveBeenCalled();
  });

  it('rejects an oversize image with an accessible error', () => {
    renderPage();

    // 6 MB > MAX_AVATAR_SIZE_BYTES (5 MB).
    fireEvent.change(screen.getByLabelText('Profile photo'), {
      target: { files: [pngFile('big.png', 6 * 1024 * 1024)] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Image must be 5 MB or smaller.');
    expect(hook.saveProfile).not.toHaveBeenCalled();
  });

  it('submits the name and a valid photo to the update hook (happy path)', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Profile photo'), {
      target: { files: [pngFile()] },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(hook.saveProfile).toHaveBeenCalledTimes(1);
    expect(hook.saveProfile).toHaveBeenCalledWith({
      displayName: 'Ada Lovelace',
      photoFile: expect.any(File),
      removePhoto: false,
    });
  });

  it('shows a busy state while saving', () => {
    hook.state = { status: 'saving' };
    renderPage();

    const save = screen.getByRole('button', { name: 'Saving…' });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('aria-busy', 'true');
  });

  it('surfaces a save error in an alert', () => {
    hook.state = { status: 'error', message: 'Upload failed' };
    renderPage();

    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });

  it('confirms success with a status message', () => {
    hook.state = { status: 'success' };
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Your profile has been saved.');
  });

  it('clears the shown photo and requests removal when "Remove photo" is used', async () => {
    const { container } = renderPage({ photoUrl: 'https://cdn.test/ada.png' });

    // The existing photo renders as an <img> in the preview avatar.
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/ada.png');

    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));

    // Photo is gone from the preview (initials fallback), and a save requests removal.
    expect(container.querySelector('img')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(hook.saveProfile).toHaveBeenCalledWith({
      displayName: 'Ada Lovelace',
      photoFile: null,
      removePhoto: true,
    });
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = renderPage({ photoUrl: 'https://cdn.test/ada.png' });

    const results = await axe.run(container, {
      // Contrast can't be computed in jsdom (no layout); assert the rest.
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });

  it('scopes the Upload/Remove controls under the form', () => {
    const { container } = renderPage({ photoUrl: 'https://cdn.test/ada.png' });
    const form = container.querySelector('form') as HTMLFormElement;

    expect(within(form).getByRole('button', { name: 'Upload photo' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Remove photo' })).toBeInTheDocument();
  });
});
