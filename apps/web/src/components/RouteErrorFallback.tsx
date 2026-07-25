import { useEffect, useRef } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { reportError, type TSurface } from '@/lib/reportError.ts';

export interface IRouteErrorFallbackProps {
  surface: TSurface;
}

/**
 * Router-level error UI (#27, D2) — attached as `errorElement` on the router
 * roots and on the /p and /t lazy tree roots, so external users never see a
 * blank screen (or firm-flavored chrome) when a route render or loader throws.
 *
 * Route error *responses* (`isRouteErrorResponse`, e.g. no matching route)
 * are navigation outcomes, not crashes: they render the not-found variant and
 * are deliberately not reported — keeps 404 noise out of error tracking.
 */
/**
 * Not-found screen — rendered for route error *responses* (e.g. loaders
 * throwing 404) and as an explicit `path: '*'` catch-all where a router has
 * no layout route to absorb unknown paths (apex). Never reported.
 */
export function NotFoundScreen() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground"
    >
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">
        Page not found
      </h1>
      <p className="max-w-md">
        This page doesn&rsquo;t exist, or the link you followed is no longer valid.
      </p>
    </main>
  );
}

export function RouteErrorFallback({ surface }: IRouteErrorFallbackProps) {
  const error = useRouteError();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reportedRef = useRef(false);
  const isRouteResponse = isRouteErrorResponse(error);

  useEffect(() => {
    // Move focus to the alert heading so keyboard/AT users land on the message.
    headingRef.current?.focus();
    if (isRouteResponse || reportedRef.current) {
      return;
    }
    reportedRef.current = true;
    reportError(error, { surface, source: 'route-error' });
  }, [error, isRouteResponse, surface]);

  if (isRouteResponse) {
    return <NotFoundScreen />;
  }

  return (
    <main
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground"
    >
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">
        Something went wrong
      </h1>
      <p className="max-w-md">
        An unexpected error stopped this page from working. Reloading usually fixes it.
      </p>
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
        className="min-h-11 rounded-md border border-foreground/20 px-4 py-2 font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Reload page
      </button>
    </main>
  );
}
