import { Button } from '@siapp/ui';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { useAdminAuth } from './useAdminAuth.ts';

export interface IAdminRequireAuthProps {
  children: ReactNode;
}

/**
 * Route guard for the Siapp admin surface.
 *
 * loading   → spinner
 * signedOut → redirect to /login
 * notAdmin  → "Access denied" screen with sign-out button
 * signedIn  → render children
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

  if (state.status === 'signedOut') {
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

  return <>{children}</>;
}
