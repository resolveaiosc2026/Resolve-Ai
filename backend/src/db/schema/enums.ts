import { pgEnum } from 'drizzle-orm/pg-core';

/** Fixed value sets. Channels are deliberately NOT enums (they are config-validated text). */

export const currencyEnum = pgEnum('currency', ['USD', 'LRD']);

export const bundleValidityEnum = pgEnum('bundle_validity', ['daily', 'weekly', 'monthly']);

export const valueTierEnum = pgEnum('value_tier', ['high', 'medium', 'low']);

export const activationStatusEnum = pgEnum('activation_status', ['success', 'failed']);

export const faultSourceEnum = pgEnum('fault_source', ['customer_report', 'network_monitoring']);

export const metricPeriodEnum = pgEnum('metric_period', [
  'baseline',
  'current',
  'post_intervention',
]);

export const priorityBandEnum = pgEnum('priority_band', ['high', 'medium', 'low']);

export const queueStatusEnum = pgEnum('queue_status', [
  'new',
  'awaiting_reply',
  'unclassified',
  'ready',
  'action_done',
  'closed',
]);

export const feedbackTriggerEnum = pgEnum('feedback_trigger', ['no_evidence', 'low_confidence']);

export const feedbackRequestStatusEnum = pgEnum('feedback_request_status', [
  'pending',
  'handed_off',
  'responded',
  'no_response',
]);

export const sentimentEnum = pgEnum('sentiment', ['negative', 'neutral', 'positive']);

export const classificationSourceEnum = pgEnum('classification_source', [
  'evidence',
  'feedback',
  'human',
]);

export const recommendationStatusEnum = pgEnum('recommendation_status', [
  'pending',
  'approved',
  'rejected',
  'superseded',
]);

export const interventionStatusEnum = pgEnum('intervention_status', [
  'approved',
  'handed_off',
  'delivered',
  'failed',
  'cancelled',
]);

export const outcomeCohortEnum = pgEnum('outcome_cohort', ['treated', 'control']);

export const outcomeTypeEnum = pgEnum('outcome_type', [
  're_engaged',
  'partially_engaged',
  'no_change',
  'declined_further',
]);
