import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';

export const healthRouter = Router();

healthRouter.get(
  '/healthz',
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'siapp-api',
    });
  }),
);
