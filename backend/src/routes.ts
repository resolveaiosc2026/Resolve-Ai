import { Router } from 'express';

import { customersRouter } from './modules/customers/customers.routes.js';
import { detectionRunsRouter, riskRouter, segmentsRouter } from './modules/detect/detect.routes.js';
import { healthRouter } from './modules/health/health.routes.js';

/** All versioned API routes, mounted at /api/v1. Add one line per feature module. */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/risk', riskRouter);
apiRouter.use('/segments', segmentsRouter);
apiRouter.use('/detection-runs', detectionRunsRouter);
apiRouter.use('/customers', customersRouter);
