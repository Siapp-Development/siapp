/**
 * Pluggable client-side error reporting (#27).
 *
 * Default: no sink is registered, so every report falls through to a single
 * guarded `console.error` — dev/prod visibility even before (or without) a
 * sink.
 *
 * Sentry sink: `initSentry.ts` — only when `import.meta.env.VITE_SENTRY_DSN`
 * is truthy in a production build — dynamic-imports `@sentry/react` (keeps
 * the SDK out of the critical chunk) and registers a captureException sink.
 * Without a DSN the SDK never loads. Call sites here never change.
 *
 * PII policy (multi-tenancy): context values must be ids
 * (workspaceId/projectId/taskId) and enum-ish strings only — never document
 * data, client names, or phone numbers. The IErrorContext value type enforces
 * primitives; keeping ids-only is a reviewed convention so a future Sentry
 * org never receives tenant data. See plans/runbook-observability.md.
 */

export type TSurface = 'apex' | 'portal' | 'collab' | 'dashboard' | 'admin';

export type TErrorSource =
  | 'error-boundary'
  | 'route-error'
  | 'window'
  | 'unhandledrejection'
  | 'manual';

export interface IErrorContext {
  surface: TSurface;
  source: TErrorSource;
  componentStack?: string;
  // ids only — never document data / PII (see module header).
  [key: string]: string | number | boolean | undefined;
}

export type TErrorSink = (error: unknown, context: IErrorContext) => void;

let sink: TErrorSink | null = null;

/** Errors already sent through reportError — drops the window.onerror echo. */
const alreadyReported = new WeakSet<object>();

function markReported(error: unknown): void {
  if (typeof error === 'object' && error !== null) {
    alreadyReported.add(error);
  }
}

function wasReported(error: unknown): boolean {
  return typeof error === 'object' && error !== null && alreadyReported.has(error);
}

/** Part B: Sentry (or any backend) registers itself here. Last write wins. */
export function registerErrorSink(next: TErrorSink): void {
  sink = next;
}

/**
 * Reports an error to the registered sink, falling back to the console.
 * Never throws — reporting must never cascade into a second crash.
 */
export function reportError(error: unknown, context: IErrorContext): void {
  markReported(error);
  if (sink !== null) {
    try {
      sink(error, context);
      return;
    } catch {
      // A broken sink must never take the app down — fall through to console.
    }
  }
  // Deliberate console usage: the one place unreported errors stay visible
  // until Part B registers a Sentry sink. Single call per error, never throws.
  // eslint-disable-next-line no-console
  console.error('[siapp:reportError]', context, error);
}

let teardownGlobalHandlers: (() => void) | null = null;

/**
 * Captures uncaught `window` errors and unhandled promise rejections.
 * Idempotent: repeat calls (StrictMode double-invoke, HMR) are no-ops.
 * Call once per entry, before the first render.
 */
export function installGlobalErrorHandlers(surface: TSurface): void {
  if (teardownGlobalHandlers !== null) {
    return;
  }

  const onError = (event: ErrorEvent): void => {
    // Error boundaries report first; the window event for the same Error
    // object is an echo (React re-throws in dev) — skip it.
    if (wasReported(event.error)) {
      return;
    }
    reportError(event.error ?? event.message, { surface, source: 'window' });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    if (wasReported(event.reason)) {
      return;
    }
    reportError(event.reason, { surface, source: 'unhandledrejection' });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  teardownGlobalHandlers = () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}

/** Test-only: unregisters the sink and the global handlers between cases. */
export function resetErrorReportingForTests(): void {
  sink = null;
  teardownGlobalHandlers?.();
  teardownGlobalHandlers = null;
}
