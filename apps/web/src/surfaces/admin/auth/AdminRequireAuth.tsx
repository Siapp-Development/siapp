import { Button } from '@siapp/ui';
import { multiFactor } from 'firebase/auth';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { AdminMfaEnrollScreen } from './AdminMfaEnrollScreen.tsx';
import { useAdminAuth } from './useAdminAuth.ts';

export interface IAdminRequireAuthProps {
  children: ReactNode;
}

/**
 * Route guard for the Siapp admin surface.
 *
 * loading      → spinner
 * signedOut    → redirect to /login
 * mfaChallenge → redirect to /login (code entry lives there)
 * notAdmin     → "Access denied" screen with sign-out button
 * mfaRequired  → TOTP enrolment screen, or re-sign-in prompt when already enrolled (#10, #63)
 * signedIn     → render children
 */
export function AdminRequireAuth({ children }: IAdminRequireAuthProps) {
  const { state, signOutUser } = useAdminAuth();

  if (state.status === 'loading') {
    return (
      <main id="main" className="px-6 py-16">
        <p role="status" aria-live="polite" className="text-center">
          Checking your session…
        </p>
      </main>
    );
  }

  if (state.status === 'signedOut' || state.status === 'mfaChallenge') {
    return <Navigate to="/login" replace />;
  }

  if (state.status === 'notAdmin') {
    return (
      <main id="main" className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {state.user.email} does not have Siapp admin access.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void signOutUser()}>
          Sign out
        </Button>
      </main>
    );
  }

  if (state.status === 'mfaRequired') {
    // No factor enrolled yet → walk the admin through TOTP enrolment (#63).
    if (multiFactor(state.user).enrolledFactors.length === 0) {
      return (
        <AdminMfaEnrollScreen
          user={state.user}
          onEnrolled={signOutUser}
          signOutUser={signOutUser}
        />
      );
    }
    // Factor exists but this session lacks a second-factor signal — a fresh
    // sign-in resolves the TOTP challenge and stamps the token.
    return (
      <main id="main" className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-bold">Multi-factor authentication required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This session for {state.user.email} was created without a second factor. Sign out and
          sign in again — you'll be asked for your authenticator code.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void signOutUser()}>
          Sign out
        </Button>
      </main>
    );
  }

  return <>{children}</>;
}
