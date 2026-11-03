import type { RequestHandler } from 'express';

import { logger } from '../lib/logger.js';

/** Logs one line per request once the response has been sent. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = performance.now();

  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });

  next();
};
