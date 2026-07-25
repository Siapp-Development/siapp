/**
 * Structured-logging convention for Cloud Functions (#27).
 *
 * Every `logger.error`/`logger.warn` call takes a static message prefixed
 * `<fnName>:` plus a context object of ids (workspaceId/projectId/taskId…);
 * caught error values go under an `err` key normalized by `errorPayload()`.
 *
 * Why: Google Cloud Error Reporting auto-groups exceptions by the stack
 * trace inside the structured jsonPayload — a raw `Error` instance spread
 * into the payload serializes inconsistently and loses its stack, which
 * breaks grouping. Normalizing to `{ name, message, stack }` strings makes
 * Error Reporting a zero-credential "Sentry-equivalent" for the backend
 * until Part B wires Sentry. See plans/runbook-observability.md.
 *
 * Local by design: functions cannot import @siapp/shared, so this helper
 * lives here rather than in the shared package.
 */

export interface IErrorPayload {
  name: string;
  message: string;
  stack?: string;
}

function describeNonError(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    // JSON.stringify returns undefined for undefined/functions/symbols.
    return JSON.stringify(value) ?? String(value);
  } catch {
    // Circular structures etc. — best-effort description.
    return String(value);
  }
}

/**
 * Normalizes any thrown value into plain `{ name, message, stack? }` strings
 * for structured logging. Never throws.
 */
export function errorPayload(error: unknown): IErrorPayload {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(typeof error.stack === 'string' ? { stack: error.stack } : {}),
    };
  }
  return {
    name: 'NonError',
    message: describeNonError(error),
  };
}
