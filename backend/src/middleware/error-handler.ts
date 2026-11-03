import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { HttpError, type ErrorDetail } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

type ErrorBody = { error: { code: string; message: string; details?: ErrorDetail[] } };

function isBodyParseError(err: unknown): boolean {
  return (
    err instanceof SyntaxError &&
    typeof err === 'object' &&
    'type' in err &&
    err.type === 'entity.parse.failed'
  );
}

/** Converts any thrown error into the standard `{ error: { code, message, details } }` response. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    } satisfies ErrorBody);
    return;
  }

  if (isBodyParseError(err)) {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    } satisfies ErrorBody);
    return;
  }

  logger.error('Unhandled error', {
    method: req.method,
    path: req.originalUrl,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });

  const message =
    env.NODE_ENV === 'production' || !(err instanceof Error)
      ? 'An unexpected error occurred'
      : err.message;

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } } satisfies ErrorBody);
};
