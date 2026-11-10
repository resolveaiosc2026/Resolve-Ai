import { readFileSync } from 'node:fs';

import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { docsRouter } from './docs/docs.routes.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { apiRouter } from './routes.js';

/** Version from package.json (src/ and dist/ are both one level below it). */
export const APP_VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

function serviceInfo() {
  return {
    service: 'resolve-ai-backend',
    description:
      'Resolve AI decision-intelligence API: Detect → Understand → Recommend → Act → Measure → Report.',
    version: APP_VERSION,
    environment: env.NODE_ENV,
    simulation: env.ENABLE_SIMULATION ? 'on' : 'off',
    links: { docs: '/api/v1/docs', openapi: '/api/v1/openapi.json', health: '/api/v1/health' },
  };
}

/** Builds the Express app without starting a server, so it can be reused by scripts and tests. */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Railway (and most PaaS) sit behind one proxy: use its X-Forwarded-For for the client IP.
  app.set('trust proxy', 1);
  app.use(requestLogger);
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (_req, res) => {
    res.json({ data: serviceInfo() });
  });
  app.get('/api/v1', (_req, res) => {
    res.json({ data: serviceInfo() });
  });
  app.use('/api/v1', docsRouter);
  app.use('/api/v1', rateLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
