import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { AppError } from '../lib/AppError.js';

/**
 * Central error handler. Must be registered last, after all routes.
 * Maps `AppError` subclasses to structured JSON responses and logs the error
 * with the request-scoped Pino logger when available.
 */
export function errorHandler(logger: Logger) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AppError) {
      logger.warn({ err, statusCode: err.statusCode }, err.message);
      res.status(err.statusCode).json({
        error: {
          name: err.name,
          message: err.message,
        },
      });
      return;
    }

    // Unexpected error — log full stack and return 500.
    //
    // #27 Sentry wiring point (Part B): when process.env.SENTRY_DSN is set,
    // initialize @sentry/node once at app bootstrap and call
    // Sentry.captureException(err) right here before responding. Until the
    // API deploys, the structured pino JSON below is the error signal —
    // Cloud Logging / Error Reporting parse it once the service runs on
    // Cloud Run. See plans/runbook-observability.md (B1).
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({
      error: {
        name: 'InternalServerError',
        message: 'An unexpected error occurred.',
      },
    });
  };
}
