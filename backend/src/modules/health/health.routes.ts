import { Router } from 'express';

import { env } from '../../config/env.js';
import { checkDatabase } from '../../db/client.js';

export const healthRouter = Router();

/** Liveness + database reachability. 503 when the database is down, so monitors can alert. */
healthRouter.get('/', async (_req, res) => {
  const database = await checkDatabase();
  const healthy = database.status === 'up';

  res.status(healthy ? 200 : 503).json({
    data: {
      status: healthy ? 'ok' : 'degraded',
      service: 'resolve-ai-backend',
      environment: env.NODE_ENV,
      simulation: env.ENABLE_SIMULATION ? 'on' : 'off',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database,
    },
  });
});
