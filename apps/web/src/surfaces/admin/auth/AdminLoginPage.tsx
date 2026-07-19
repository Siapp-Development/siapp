import { Button } from '@siapp/ui';
import { FirebaseError } from 'firebase/app';
import { useState } from 'react';
import { Navigate } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import { useAdminAuth } from './useAdminAuth.ts';

/** [Z1] Siapp Admin sign-in screen — Google SSO only, no email/password. */
export function AdminLoginPage() {
  const { state, signInWithGoogle } = useAdminAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (state.status === 'signedIn') {
    return <Navigate to="/" replace />;
  }

  async function handleGoogleSignIn(): Promise<void> {
    setError(null);
    setPending(true);
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
          setError('Sign-in failed. Try again or contact the Siapp team.');
        }
      } else {
        setError('Something went wrong. Please try again.');
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
            <h1 className="text-2xl font-bold">Siapp Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">Internal tooling — authorised access only.</p>
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            className="w-full"
            disabled={pending}
            onClick={() => void handleGoogleSignIn()}
          >
            {pending ? 'Signing in…' : 'Sign in with Google'}
          </Button>
        </div>
      </main>
    </>
  );
}
