import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from './useAuth.ts';

export interface IRequireAuthProps {
  children: ReactNode;
}

/** Gate for /:workspaceSlug/* — renders children only for a signed-in user. */
export function RequireAuth({ children }: IRequireAuthProps) {
  const { state } = useAuth();
  const location = useLocation();

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
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}
