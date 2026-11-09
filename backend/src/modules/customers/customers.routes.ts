import { Router } from 'express';

import { caseQuerySchema, customerIdParamSchema } from '../detect/detect.schemas.js';
import { reviewerBodySchema } from '../understand/understand.schemas.js';
import * as understand from '../understand/understand.service.js';
import * as service from './customers.service.js';

export const customersRouter = Router();

customersRouter.get('/', async (req, res) => {
  const { page, pageSize, ...filters } = caseQuerySchema.parse(req.query);
  const { rows, total } = await service.listCustomers(filters, { page, pageSize });
  res.json({ data: rows, meta: { page, pageSize, total } });
});

customersRouter.get('/:customerId', async (req, res) => {
  const { customerId } = customerIdParamSchema.parse(req.params);
  res.json({ data: await service.getCustomer(customerId) });
});

/* Understand: the case's reason (frontend ClassificationView) + evidence assessment. */
customersRouter.get('/:customerId/reasons', async (req, res) => {
  const { customerId } = customerIdParamSchema.parse(req.params);
  res.json({ data: await understand.getReasons(customerId) });
});

/* Human-confirmed: accept strong behavioural evidence as the reason (case → ready). */
customersRouter.post('/:customerId/reasons/evidence', async (req, res) => {
  const { customerId } = customerIdParamSchema.parse(req.params);
  const { reviewerName } = reviewerBodySchema.parse(req.body ?? {});
  res.status(201).json({ data: await understand.acceptEvidence(customerId, reviewerName) });
});
