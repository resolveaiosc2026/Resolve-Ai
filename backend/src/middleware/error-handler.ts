import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { HttpError, type ErrorDetail } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

type ErrorBody = { error: { code: string; message: string; details?: ErrorDetail[] } };

type ClientError = { status: number; code: string; message: string };

/** Maps errors raised by Express's JSON body parser (they carry a `type`) to client errors. */
function toBodyParserError(err: unknown): ClientError | null {
  if (typeof err !== 'object' || err === null || !('type' in err)) return null;

  switch (err.type) {
    case 'entity.parse.failed':
      return { status: 400, code: 'INVALID_JSON', message: 'Request body is not valid JSON' };
    case 'entity.too.large':
      return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return { status: 415, code: 'UNSUPPORTED_ENCODING', message: 'Unsupported body encoding' };
    default: {
      const status = 'status' in err && typeof err.status === 'number' ? err.status : 0;
      return status >= 400 && status < 500
        ? { status, code: 'BAD_REQUEST', message: 'The request body could not be read' }
        : null;
    }
  }
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

  const clientError = toBodyParserError(err);
  if (clientError) {
    res.status(clientError.status).json({
      error: { code: clientError.code, message: clientError.message },
    } satisfies ErrorBody);
    return;
  }

  // Drizzle wraps driver errors ("Failed query: …"); the real reason is in `cause`.
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause : undefined;
  logger.error('Unhandled error', {
    method: req.method,
    path: req.originalUrl,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
    cause: cause ? { name: cause.name, message: cause.message } : undefined,
  });

  const message =
    env.NODE_ENV === 'production' || !(err instanceof Error)
      ? 'An unexpected error occurred'
      : cause
        ? `${err.message.split('\n')[0]} (cause: ${cause.message})`
        : err.message;

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } } satisfies ErrorBody);
};
