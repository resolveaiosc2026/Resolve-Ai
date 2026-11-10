import { Router } from 'express';
import { z } from 'zod';

import * as service from './copilot.service.js';

export const chatBodySchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    conversationId: z.uuid().optional(),
    style: z.enum(['natural', 'template']).optional(),
  })
  .strict();

export const conversationParamSchema = z.object({ conversationId: z.uuid() });

/* /copilot: questions answered from the backend's own aggregates. */
export const copilotRouter = Router();

copilotRouter.post('/chat', async (req, res) => {
  const body = chatBodySchema.parse(req.body ?? {});
  res.status(201).json({ data: await service.ask(body) });
});

copilotRouter.get('/suggestions', (_req, res) => {
  res.json({ data: service.suggestions() });
});

copilotRouter.get('/conversations/:conversationId', async (req, res) => {
  const { conversationId } = conversationParamSchema.parse(req.params);
  res.json({ data: await service.getConversation(conversationId) });
});
