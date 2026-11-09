import { Router } from 'express';

import { feedbackQuerySchema } from './understand.schemas.js';
import * as service from './understand.service.js';

/* /feedback-requests: the feedback queue (requests handed off to Orange channels). */
export const feedbackRequestsRouter = Router();

feedbackRequestsRouter.get('/', async (req, res) => {
  const { page, pageSize, ...filters } = feedbackQuerySchema.parse(req.query);
  const { rows, total } = await service.listFeedbackRequests(filters, { page, pageSize });
  res.json({ data: rows, meta: { page, pageSize, total } });
});

feedbackRequestsRouter.get('/suggestions', async (_req, res) => {
  res.json({ data: await service.getSuggestions() });
});
