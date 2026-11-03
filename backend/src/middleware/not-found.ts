import type { RequestHandler } from 'express';

import { HttpError } from '../lib/http-error.js';

/** Turns any unmatched route into a 404 handled by the error handler. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} does not exist`));
};
