import { Router } from 'express';

import { env } from './config/env.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { detectionRunsRouter, riskRouter, segmentsRouter } from './modules/detect/detect.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import {
  actionsRouter,
  customerLoopRouter,
  dashboardRouter,
  feedbackReplyRouter,
  inboundRouter,
  interventionsRouter,
  reasonsRouter,
  recommendationsRouter,
  reportsRouter,
  simulationRouter,
} from './modules/loop.routes.js';
import { feedbackRequestsRouter } from './modules/understand/understand.routes.js';

/** All versioned API routes, mounted at /api/v1. Add one line per feature module. */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);

// 1. Detect
apiRouter.use('/risk', riskRouter);
apiRouter.use('/segments', segmentsRouter);
apiRouter.use('/detection-runs', detectionRunsRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/customers', customerLoopRouter);

// 2. Understand
apiRouter.use('/feedback-requests', feedbackRequestsRouter);
apiRouter.use('/feedback-requests', feedbackReplyRouter);
apiRouter.use('/feedback', inboundRouter);
apiRouter.use('/reasons', reasonsRouter);

// 3. Recommend, 4. Act, 5. Measure
apiRouter.use('/recommendations', recommendationsRouter);
apiRouter.use('/actions', actionsRouter);
apiRouter.use('/interventions', interventionsRouter);

// 6. Report
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/dashboard', dashboardRouter);

// Demo only: plays Orange's channel and the post-intervention window. Never in production.
if (env.NODE_ENV !== 'production') apiRouter.use('/simulation', simulationRouter);
