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
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({
      error: {
        name: 'InternalServerError',
        message: 'An unexpected error occurred.',
      },
    });
  };
}
