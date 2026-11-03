import cors from 'cors';
import express, { type Express } from 'express';

import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestLogger } from './middleware/request-logger.js';
import { apiRouter } from './routes.js';

/** Builds the Express app without starting a server, so it can be reused by scripts and tests. */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
