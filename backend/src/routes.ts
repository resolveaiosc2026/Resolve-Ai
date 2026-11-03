import { Router } from 'express';

import { healthRouter } from './modules/health/health.routes.js';

/** All versioned API routes, mounted at /api/v1. Add one line per feature module. */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
