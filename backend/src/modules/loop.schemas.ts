/** Request validation for the Understand-channels, Recommend, Act, Measure and Report endpoints. */
import { z } from 'zod';

import { CHANNELS, FEEDBACK } from '../config/rules.js';

const reviewerName = z.string().trim().min(1).max(60);
const text = z.string().trim().min(1).max(FEEDBACK.maxTextLength);
const paging = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
};

export const uuidParamSchema = z.object({ id: z.uuid() });
export const recommendationIdParamSchema = z.object({ recommendationId: z.uuid() });
export const interventionParamSchema = z.object({
  id: z.union([z.uuid(), z.string().regex(/^INT-\d{4,6}$/, 'must be a uuid or INT-1234')]),
});
export const classificationIdParamSchema = z.object({ classificationId: z.uuid() });

/* F5 */
export const handOffBodySchema = z
  .object({
    channel: z.enum(FEEDBACK.outboundChannels),
    reviewerName,
    question: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const replyBodySchema = z
  .object({
    text,
    receivedAt: z.iso
      .datetime({ offset: true })
      .refine((v) => new Date(v).getTime() <= Date.now(), 'must not be in the future')
      .optional(),
  })
  .strict();

export const simulatedReplyBodySchema = z.object({ text: text.optional() }).strict();

export const inboundBodySchema = z
  .object({
    channel: z.enum(FEEDBACK.inboundChannels),
    text,
    customerId: z
      .string()
      .regex(/^LR-\d{5}$/, 'must look like LR-12345')
      .optional(),
    region: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

export const overrideBodySchema = z
  .object({
    reasonId: z.enum([
      'affordability',
      'reduced_need',
      'competitor',
      'network_quality',
      'activation_difficulty',
      'unknown',
    ]),
    reviewerName,
    note: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

/* F6 */
export const persistRecommendationBodySchema = z
  .object({ reviewerName: reviewerName.optional() })
  .strict();
export const recommendationQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'superseded']).optional(),
  ...paging,
});

/* F7 */
export const approveBodySchema = z
  .object({
    reviewerName,
    actionId: z.string().trim().min(1).max(60).optional(),
    channel: z.enum(CHANNELS).optional(),
    window: z.string().trim().min(1).max(60).optional(),
    note: z.string().trim().min(1).max(300).optional(),
  })
  .strict();
export const rejectBodySchema = z
  .object({ reviewerName, note: z.string().trim().min(1).max(300) })
  .strict();
export const interventionQuerySchema = z.object({
  status: z.enum(['approved', 'handed_off', 'delivered', 'failed', 'cancelled']).optional(),
  ...paging,
});

/* F8 */
export const advanceBodySchema = z
  .object({ scenario: z.enum(['recover', 'partial', 'no_change', 'decline']).optional() })
  .strict();
export const outcomeBodySchema = z
  .object({
    reviewerName: reviewerName.optional(),
    notes: z.string().trim().min(1).max(300).optional(),
  })
  .strict();
