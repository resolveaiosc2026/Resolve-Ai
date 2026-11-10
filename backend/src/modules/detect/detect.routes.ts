import { Router } from 'express';

import {
  bandParamSchema,
  caseQuerySchema,
  customerIdParamSchema,
  pagingSchema,
  runDetectionBodySchema,
} from './detect.schemas.js';
import * as service from './detect.service.js';

/* /risk: the priority queue every screen starts from. */
export const riskRouter = Router();

riskRouter.get('/', async (req, res) => {
  const { page, pageSize, ...filters } = caseQuerySchema.parse(req.query);
  const { rows, total } = await service.getQueue(filters, { page, pageSize });
  res.json({ data: rows, meta: { page, pageSize, total } });
});

// Declared before '/:customerId' so "summary" isn't treated as an id.
riskRouter.get('/summary', async (_req, res) => {
  res.json({ data: await service.getSummary() });
});

riskRouter.get('/:customerId', async (req, res) => {
  const { customerId } = customerIdParamSchema.parse(req.params);
  res.json({ data: (await service.getCase(customerId)).row });
});

/* /segments: priority bands (high / medium / low). */
export const segmentsRouter = Router();

segmentsRouter.get('/', async (_req, res) => {
  res.json({ data: await service.getSegments() });
});

segmentsRouter.get('/:band', async (req, res) => {
  const { band } = bandParamSchema.parse(req.params);
  const { page, pageSize } = pagingSchema.parse(req.query);
  const { rows, total } = await service.getQueue({ band }, { page, pageSize });
  res.json({ data: rows, meta: { page, pageSize, total } });
});

/* /detection-runs */
export const detectionRunsRouter = Router();

detectionRunsRouter.get('/latest', async (_req, res) => {
  res.json({ data: await service.getLatestRun() });
});

detectionRunsRouter.post('/', async (req, res) => {
  const { asOf } = runDetectionBodySchema.parse(req.body ?? {});
  const summary = await service.runDetection(asOf ? new Date(asOf) : undefined);
  res.status(201).json({ data: summary });
});
