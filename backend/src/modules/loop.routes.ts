/**
 * Routes for closing the loop: Understand (channels + AI), Recommend, Act, Measure, Report.
 * Thin: validate → service → respond. Simulation routes are mounted separately (demo only).
 */
import { Router } from 'express';

import * as act from './act/act.service.js';
import { customerIdParamSchema } from './detect/detect.schemas.js';
import {
  advanceBodySchema,
  approveBodySchema,
  classificationIdParamSchema,
  handOffBodySchema,
  inboundBodySchema,
  interventionParamSchema,
  interventionQuerySchema,
  outcomeBodySchema,
  overrideBodySchema,
  persistRecommendationBodySchema,
  recommendationIdParamSchema,
  recommendationQuerySchema,
  rejectBodySchema,
  replyBodySchema,
  simulatedReplyBodySchema,
  uuidParamSchema,
} from './loop.schemas.js';
import * as measure from './measure/measure.service.js';
import * as recommendService from './recommend/recommend.service.js';
import * as report from './report/report.service.js';
import * as channels from './understand/channels.service.js';
import { pickSimulatedReply } from './understand/reply-library.js';

/* ---------- Customer-scoped (mounted under /customers) ---------- */
export const customerLoopRouter = Router({ mergeParams: true });

customerLoopRouter.post('/:customerId/feedback-requests', async (req, res) => {
  const { customerId } = customerIdParamSchema.parse(req.params);
  const body = handOffBodySchema.parse(req.body ?? {});
  res.status(201).json({ data: await channels.handOff(customerId, body) });
});

customerLoopRouter.get('/:customerId/recommendation', async (req, res) => {
  const { customerId } = customerIdParamSchema.parse(req.params);
  res.json({ data: await recommendService.getRecommendationView(customerId) });
});

customerLoopRouter.post('/:customerId/recommendations', async (req, res) => {
  const { customerId } = customerIdParamSchema.parse(req.params);
  persistRecommendationBodySchema.parse(req.body ?? {});
  res.status(201).json({ data: await recommendService.persistRecommendation(customerId) });
});

customerLoopRouter.get('/:customerId/measure', async (req, res) => {
  const { customerId } = customerIdParamSchema.parse(req.params);
  res.json({ data: await measure.getMeasureView(customerId) });
});

/* ---------- Feedback replies (mounted under /feedback-requests) ---------- */
export const feedbackReplyRouter = Router();

feedbackReplyRouter.post('/:id/responses', async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const { text, receivedAt } = replyBodySchema.parse(req.body ?? {});
  const result = await channels.ingestReply(id, {
    text,
    receivedAt: receivedAt ? new Date(receivedAt) : undefined,
    simulated: false,
  });
  res.status(201).json({ data: result });
});

/* ---------- /feedback (inbound) ---------- */
export const inboundRouter = Router();

inboundRouter.post('/', async (req, res) => {
  const body = inboundBodySchema.parse(req.body ?? {});
  res.status(201).json({ data: await channels.recordInbound(body) });
});

/* ---------- /reasons (human override) ---------- */
export const reasonsRouter = Router();

reasonsRouter.patch('/:classificationId', async (req, res) => {
  const { classificationId } = classificationIdParamSchema.parse(req.params);
  const body = overrideBodySchema.parse(req.body ?? {});
  res.json({ data: await channels.overrideReason(classificationId, body) });
});

/* ---------- /recommendations ---------- */
export const recommendationsRouter = Router();

recommendationsRouter.get('/', async (req, res) => {
  const { page, pageSize, ...filters } = recommendationQuerySchema.parse(req.query);
  const { rows, total } = await recommendService.listRecommendations(filters, { page, pageSize });
  res.json({ data: rows, meta: { page, pageSize, total } });
});

recommendationsRouter.get('/:id', async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  res.json({ data: await recommendService.getRecommendation(id) });
});

/* ---------- /actions (Act: :recommendationId) ---------- */
export const actionsRouter = Router();

actionsRouter.post('/:recommendationId/approve', async (req, res) => {
  const { recommendationId } = recommendationIdParamSchema.parse(req.params);
  const body = approveBodySchema.parse(req.body ?? {});
  res.status(201).json({ data: await act.approve(recommendationId, body) });
});

actionsRouter.post('/:recommendationId/reject', async (req, res) => {
  const { recommendationId } = recommendationIdParamSchema.parse(req.params);
  const body = rejectBodySchema.parse(req.body ?? {});
  res.json({ data: await act.reject(recommendationId, body) });
});

/* ---------- /interventions ---------- */
export const interventionsRouter = Router();

interventionsRouter.get('/', async (req, res) => {
  const { page, pageSize, ...filters } = interventionQuerySchema.parse(req.query);
  const { rows, total } = await act.listInterventions(filters, { page, pageSize });
  res.json({ data: rows, meta: { page, pageSize, total } });
});

interventionsRouter.get('/:id', async (req, res) => {
  const { id } = interventionParamSchema.parse(req.params);
  res.json({ data: await act.getIntervention(id) });
});

interventionsRouter.post('/:id/outcome', async (req, res) => {
  const { id } = interventionParamSchema.parse(req.params);
  const body = outcomeBodySchema.parse(req.body ?? {});
  res.status(201).json({ data: await measure.recordOutcome(id, body) });
});

/* ---------- /reports and /dashboard ---------- */
export const reportsRouter = Router();
reportsRouter.get('/summary', async (_req, res) => res.json({ data: await report.getSummary() }));
reportsRouter.get('/drivers', async (_req, res) => res.json({ data: await report.getDrivers() }));
reportsRouter.get('/actions', async (_req, res) =>
  res.json({ data: await report.getActionsReport() }),
);

export const dashboardRouter = Router();
dashboardRouter.get('/trends', async (_req, res) => res.json({ data: await report.getTrends() }));

/* ---------- /simulation (demo only; not mounted in production) ---------- */
export const simulationRouter = Router();

simulationRouter.post('/feedback-requests/:id/reply', async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const { text } = simulatedReplyBodySchema.parse(req.body ?? {});
  const result = await channels.ingestReply(id, {
    text: text ?? pickSimulatedReply(id),
    simulated: true,
  });
  res.status(201).json({ data: { ...result, simulated: true } });
});

simulationRouter.post('/interventions/:id/advance', async (req, res) => {
  const { id } = interventionParamSchema.parse(req.params);
  const { scenario } = advanceBodySchema.parse(req.body ?? {});
  res.json({ data: { ...(await measure.advance(id, scenario)), simulated: true } });
});
