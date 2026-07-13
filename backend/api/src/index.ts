import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] === 'development' && { transport: { target: 'pino-pretty' } }),
});

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.use(healthRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: { name: 'NotFoundError', message: 'Route not found' } });
  });

  app.use(errorHandler(logger));

  return app;
}

// Start server only when running directly (not during tests)
if (process.env['NODE_ENV'] !== 'test') {
  const port = parseInt(process.env['PORT'] ?? '8080', 10);
  const app = createApp();
  app.listen(port, () => {
    logger.info({ port }, 'siapp-api listening');
  });
}
