/** Request validation for Detect and Customers endpoints. */
import { z } from 'zod';

export const bandSchema = z.enum(['high', 'medium', 'low']);

export const queueStatusSchema = z.enum([
  'new',
  'awaiting_reply',
  'unclassified',
  'ready',
  'action_done',
]);

export const customerIdParamSchema = z.object({
  customerId: z.string().regex(/^LR-\d{5}$/, 'must look like LR-12345'),
});

export const bandParamSchema = z.object({ band: bandSchema });

const label = z.string().trim().min(1).max(60);

export const caseQuerySchema = z.object({
  band: bandSchema.optional(),
  status: queueStatusSchema.optional(),
  segment: label.optional(),
  region: label.optional(),
  search: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9 -]+$/, 'letters, digits, spaces and hyphens only')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type CaseQuery = z.infer<typeof caseQuerySchema>;

export const pagingSchema = caseQuerySchema.pick({ page: true, pageSize: true });

export const runDetectionBodySchema = z
  .object({
    asOf: z.iso
      .datetime({ offset: true })
      .refine((v) => new Date(v).getTime() <= Date.now(), 'must not be in the future')
      .optional(),
  })
  .strict();
