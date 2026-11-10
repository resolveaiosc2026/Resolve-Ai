/**
 * Per-IP rate limits (express-rate-limit, in-memory store). Strictest on LLM-backed routes to
 * cap abuse and AI cost. Responses use the standard error envelope and RateLimit-* headers.
 */
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

import { env } from '../config/env.js';
import { RATE_LIMITS } from '../config/rules.js';

/** Paths (relative to /api/v1) that call the LLM. */
const AI_ROUTES = [
  /^\/copilot\/chat\/?$/,
  /^\/feedback-requests\/[^/]+\/responses\/?$/,
  /^\/feedback\/?$/,
  /^\/simulation\/feedback-requests\/[^/]+\/reply\/?$/,
];

function limiter(limit: number, scope: string): RequestHandler {
  return rateLimit({
    windowMs: RATE_LIMITS.windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many ${scope} requests: limit is ${limit} per minute. Retry after the "reset" seconds in the RateLimit header.`,
        },
      });
    },
  });
}

const aiLimiter = limiter(RATE_LIMITS.ai, 'AI');
const writeLimiter = limiter(RATE_LIMITS.write, 'write');
const readLimiter = limiter(RATE_LIMITS.read, 'read');

/** Picks the right limiter for the request (mount on /api/v1). */
export const rateLimiter: RequestHandler = (req, res, next) => {
  if (!env.RATE_LIMIT_ENABLED || req.method === 'OPTIONS') return next();
  if (req.method === 'POST' && AI_ROUTES.some((r) => r.test(req.path))) {
    return aiLimiter(req, res, next);
  }
  if (req.method === 'POST' || req.method === 'PATCH') return writeLimiter(req, res, next);
  return readLimiter(req, res, next);
};
