import { Router } from 'express';

import { env } from '../../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    data: {
      status: 'ok',
      service: 'resolve-ai-backend',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});
