/**
 * Sentry wiring (#27) — registers Sentry as the reportError sink.
 *
 * Guarded by `VITE_SENTRY_DSN`: when absent (local dev, emulator runs, CI),
 * this is a synchronous no-op and none of the SDK loads. When present, the
 * SDK is dynamic-imported so it stays out of the critical chunk — the app
 * renders without waiting for it, and errors raised before the SDK resolves
 * still hit the console fallback in reportError.
 */

import { registerErrorSink, type TSurface } from './reportError.ts';

export function initSentry(surface: TSurface): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  // Production builds only: the DSN is committed in the shared .env, so the
  // dev server and vitest would otherwise report local noise to Sentry.
  if (!import.meta.env.PROD || dsn === undefined || dsn === '') {
    return;
  }
  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        initialScope: { tags: { surface } },
      });
      registerErrorSink((error, context) => {
        Sentry.captureException(error, { extra: context });
      });
    })
    .catch(() => {
      // SDK failed to load (offline, blocked) — reportError's console
      // fallback keeps working; nothing else to do.
    });
}
