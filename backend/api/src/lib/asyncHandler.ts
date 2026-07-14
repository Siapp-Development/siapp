import type { NextFunction, Request, Response } from 'express';

/**
 * Wraps an async Express route handler so that any rejected promise is
 * forwarded to Express's `next(err)` error middleware.
 *
 * Without this wrapper, unhandled async errors are swallowed in Express 4
 * (Express 5 handles this natively, but we keep it as an explicit adapter
 * for clarity).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
