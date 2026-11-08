import { Router } from 'express';

import { caseQuerySchema, customerIdParamSchema } from '../detect/detect.schemas.js';
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
