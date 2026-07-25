import { FirebaseError } from 'firebase/app';
import { signInWithPopup, signInWithRedirect, type Auth } from 'firebase/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signInWithGoogle } from './googleSignIn.ts';

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
}));

const auth = {} as Auth;

beforeEach(() => {
  vi.mocked(signInWithPopup).mockReset();
  vi.mocked(signInWithRedirect).mockReset();
});

describe('signInWithGoogle', () => {
  it('uses the popup flow when it succeeds', async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({} as never);

    await signInWithGoogle(auth);

    expect(signInWithPopup).toHaveBeenCalledOnce();
    expect(signInWithRedirect).not.toHaveBeenCalled();
  });

  it('falls back to redirect when the popup is blocked', async () => {
    vi.mocked(signInWithPopup).mockRejectedValue(new FirebaseError('auth/popup-blocked', 'blocked'));
    vi.mocked(signInWithRedirect).mockResolvedValue(undefined as never);

    await signInWithGoogle(auth);

    expect(signInWithRedirect).toHaveBeenCalledOnce();
  });

  it('falls back to redirect when popups are unsupported', async () => {
    vi.mocked(signInWithPopup).mockRejectedValue(
      new FirebaseError('auth/operation-not-supported-in-this-environment', 'nope'),
    );
    vi.mocked(signInWithRedirect).mockResolvedValue(undefined as never);

    await signInWithGoogle(auth);

    expect(signInWithRedirect).toHaveBeenCalledOnce();
  });

  it('does NOT redirect when the user dismissed the popup', async () => {
    const dismissed = new FirebaseError('auth/popup-closed-by-user', 'closed');
    vi.mocked(signInWithPopup).mockRejectedValue(dismissed);

    await expect(signInWithGoogle(auth)).rejects.toBe(dismissed);
    expect(signInWithRedirect).not.toHaveBeenCalled();
  });

  it('rethrows other sign-in errors untouched', async () => {
    const mfa = new FirebaseError('auth/multi-factor-auth-required', 'mfa');
    vi.mocked(signInWithPopup).mockRejectedValue(mfa);

    await expect(signInWithGoogle(auth)).rejects.toBe(mfa);
    expect(signInWithRedirect).not.toHaveBeenCalled();
  });
});
