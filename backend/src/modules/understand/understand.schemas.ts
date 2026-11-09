/** Request validation for Understand endpoints. */
import { z } from 'zod';

import { CHANNELS } from '../../config/rules.js';

export const reviewerBodySchema = z
  .object({ reviewerName: z.string().trim().min(1).max(60) })
  .strict();

export const feedbackQuerySchema = z.object({
  status: z.enum(['pending', 'handed_off', 'responded', 'no_response']).optional(),
  channel: z.enum(CHANNELS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
