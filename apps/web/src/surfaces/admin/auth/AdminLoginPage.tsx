import { Button, Input, Label } from '@siapp/ui';
import { FirebaseError } from 'firebase/app';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';

import siappLogoFull from '@/assets/siapp-logo-full.png';
import { SkipLink } from '@/components/SkipLink.tsx';
import { MFA_ENROLLED_FLAG } from './AdminMfaEnrollScreen.tsx';
import { useAdminAuth } from './useAdminAuth.ts';

const CODE_RE = /^\d{6}$/;

function adminAuthError(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return 'Something went wrong. Please try again.';
  }
  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Sign-in failed. Try again or contact the Siapp team.';
  }
}

/** [Z1] Siapp Admin sign-in screen — Google SSO + TOTP second factor (#10, #63). */
export function AdminLoginPage() {
  const {
    state,
    signInWithGoogle,
    signInWithPassword,
    sendForgotPasswordEmail,
    completeMfaSignIn,
    cancelMfaChallenge,
  } = useAdminAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [code, setCode] = useState('');
  const [justEnrolled, setJustEnrolled] = useState(
    () => sessionStorage.getItem(MFA_ENROLLED_FLAG) === '1',
  );

  // notAdmin/mfaRequired render blocking screens inside AdminRequireAuth —
  // never silently re-show the sign-in button for a signed-in user (#63).
  if (
    state.status === 'signedIn' ||
    state.status === 'notAdmin' ||
    state.status === 'mfaRequired'
  ) {
    return <Navigate to="/" replace />;
  }

  async function handleGoogleSignIn(): Promise<void> {
    setError(null);
    setPending(true);
    sessionStorage.removeItem(MFA_ENROLLED_FLAG);
    setJustEnrolled(false);
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err instanceof FirebaseError) {
        if (
          err.code === 'auth/popup-closed-by-user' ||
          err.code === 'auth/cancelled-popup-request'
        ) {
          setError(null);
        } else {
          setError(adminAuthError(err));
        }
      } else {
        setError(adminAuthError(err));
      }
    } finally {
      setPending(false);
    }
  }

  async function handlePasswordSignIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (email.trim() === '' || password === '') {
      setError('Enter your email and password.');
      return;
    }
    setPending(true);
    setError(null);
    setResetSent(false);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (err) {
      setError(adminAuthError(err));
    } finally {
      setPending(false);
    }
  }

  async function handleForgotPassword(): Promise<void> {
    if (email.trim() === '') {
      setError('Enter your email address first.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await sendForgotPasswordEmail(email.trim());
    } catch {
      // Intentionally swallow provider-specific errors to avoid account enumeration.
    } finally {
      setPending(false);
      setResetSent(true);
    }
  }

  async function handleCodeSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!CODE_RE.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await completeMfaSignIn(code);
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'auth/invalid-verification-code') {
        setError("That code didn't match. Check your authenticator app and try again.");
      } else {
        setError('Verification failed. Try again or contact the Siapp team.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SkipLink />
      <main id="main" className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <img src={siappLogoFull} alt="" className="mb-4 h-12 w-auto" />
            <h1 className="text-2xl font-bold">Siapp Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Internal tooling — authorised access only.
            </p>
          </div>

          {justEnrolled && state.status !== 'mfaChallenge' && (
            <p role="status" aria-live="polite" className="text-sm">
              Two-factor authentication enrolled. Sign in again to continue.
            </p>
          )}

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {resetSent && (
            <p role="status" aria-live="polite" className="text-sm">
              If that account exists, a password reset email has been sent.
            </p>
          )}

          {state.status === 'mfaChallenge' ? (
            <form onSubmit={(event) => void handleCodeSubmit(event)} className="space-y-2">
              <Label htmlFor="mfa-signin-code">Authenticator code</Label>
              <Input
                id="mfa-signin-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={error !== null}
                aria-describedby="mfa-signin-code-hint"
              />
              <p id="mfa-signin-code-hint" className="text-xs text-muted-foreground">
                Enter the 6-digit code from your authenticator app.
              </p>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? 'Verifying…' : 'Verify'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCode('');
                    setError(null);
                    cancelMfaChallenge();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <form onSubmit={(event) => void handlePasswordSignIn(event)} className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? 'Signing in…' : 'Sign in with email'}
                </Button>
              </form>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={() => void handleGoogleSignIn()}
              >
                {pending ? 'Signing in…' : 'Sign in with Google'}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={pending}
                onClick={() => void handleForgotPassword()}
              >
                Forgot password?
              </Button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
