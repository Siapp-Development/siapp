import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';

import { reportError, type TSurface } from '@/lib/reportError.ts';

export interface IAppErrorBoundaryProps {
  surface: TSurface;
  children: ReactNode;
}

interface IAppErrorBoundaryState {
  hasError: boolean;
}

/**
 * Fallback UI — deliberately self-contained (no router/firebase/surface
 * imports: it must render when everything else is broken) and neutrally
 * styled/worded because it also renders on the client portal (D-036: no
 * firm-flavored UI on external surfaces).
 */
function AppErrorFallback() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Move focus to the alert heading so keyboard/AT users land on the
    // message instead of a silently replaced page.
    headingRef.current?.focus();
  }, []);

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

/**
 * Last-resort render-error net for a whole surface (#27, D2) — wraps the
 * RouterProvider in each entry so an uncaught render error never
 * blank-screens the app.
 *
 * Class component by necessity: React only exposes render-error capture via
 * `getDerivedStateFromError`/`componentDidCatch`, which have no hook
 * equivalent — the "function components only" rule is waived here for that
 * one reason.
 */
export class AppErrorBoundary extends Component<IAppErrorBoundaryProps, IAppErrorBoundaryState> {
  override state: IAppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): IAppErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      surface: this.props.surface,
      source: 'error-boundary',
      ...(typeof info.componentStack === 'string'
        ? { componentStack: info.componentStack }
        : {}),
    });
  }

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <AppErrorFallback />;
  }
}
