import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { reasons } from './catalog.js';
import { customers } from './customers.js';
import { cases } from './detect.js';
import {
  classificationSourceEnum,
  feedbackRequestStatusEnum,
  feedbackTriggerEnum,
  sentimentEnum,
} from './enums.js';
import type { EvidenceItem, ReasonCandidate } from './json-types.js';

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

/**
 * A request for customer feedback, handed off to an existing Orange channel.
 * Resolve AI never contacts the customer itself.
 */
export const feedbackRequests = pgTable(
  'feedback_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    caseId: uuid()
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    channel: text().notNull(),
    question: text().notNull(),
    triggerReason: feedbackTriggerEnum().notNull(),
    status: feedbackRequestStatusEnum().notNull().default('pending'),
    createdAt: timestamptz().notNull().defaultNow(),
    handedOffAt: timestamptz(),
    respondedAt: timestamptz(),
  },
  (t) => [index('feedback_requests_case_idx').on(t.caseId)],
);

/** Feedback returned by an Orange channel, or inbound (customer service, public comments). */
export const customerFeedback = pgTable(
  'customer_feedback',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: text().references(() => customers.id, { onDelete: 'restrict' }),
    caseId: uuid().references(() => cases.id, { onDelete: 'restrict' }),
    feedbackRequestId: uuid().references(() => feedbackRequests.id, { onDelete: 'restrict' }),
    channel: text().notNull(),
    region: text(),
    rawText: text().notNull(),
    simulated: boolean().notNull().default(true),
    receivedAt: timestamptz().notNull(),
  },
  (t) => [
    index('customer_feedback_case_idx').on(t.caseId),
    index('customer_feedback_customer_idx').on(t.customerId),
  ],
);

/** The reason attached to a case: from evidence, from feedback (AI), or set by a human. */
export const reasonClassifications = pgTable(
  'reason_classifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    caseId: uuid()
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    feedbackId: uuid().references(() => customerFeedback.id, { onDelete: 'restrict' }),
    reasonId: text()
      .notNull()
      .references(() => reasons.id, { onDelete: 'restrict' }),
    confidence: numeric({ precision: 4, scale: 3, mode: 'number' }).notNull(),
    alternatives: jsonb().$type<ReasonCandidate[]>().notNull(),
    sentiment: sentimentEnum(),
    summary: text().notNull(),
    evidence: jsonb().$type<EvidenceItem[]>().notNull(),
    source: classificationSourceEnum().notNull(),
    /** `rules`, `llm:<model>`, `keyword_fallback`, or the analyst's name. */
    classifiedBy: text().notNull(),
    needsReview: boolean().notNull().default(false),
    reviewedReasonId: text().references(() => reasons.id, { onDelete: 'restrict' }),
    reviewedBy: text(),
    reviewedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [index('reason_classifications_case_idx').on(t.caseId)],
);
