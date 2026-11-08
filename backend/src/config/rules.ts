/**
 * Tunable business rules in one place. Values mirror the frontend prototype
 * (frontend/lib/analytics.ts) so the API reproduces the figures on screen.
 */

export const DETECTION = {
  modelVersion: 'rules-v1',
  /** Weekly usage windows: trailing baseline vs current weeks. */
  baselineWeeks: 8,
  currentWeeks: 4,
  weeksPerMonth: 30.44 / 7,
  /** The customer's own normal range: ±12% of their baseline. */
  normalBandPct: 0.12,
  /** Activation windows: last 30 days vs the 60 days before (averaged per 30 days). */
  activationCurrentDays: 30,
  activationBaselineDays: 60,
  /** A customer is flagged when usage changed by this much or more (negative = drop). */
  flagThresholdPct: -15,
  /** Care contacts and fault reports are counted over this many days before the run. */
  signalWindowDays: 30,
} as const;

export const PRIORITY = {
  drop: { max: 40, pointsPerPct: 0.58 },
  valueTier: { high: 18, medium: 10, low: 4, max: 18 },
  tenure: { max: 15, monthsPerPoint: 3 },
  inactivity: { max: 12, daysPerPoint: 2.2 },
  care: { max: 8, pointsPerContact: 3 },
  bands: { high: 75, medium: 55 },
} as const;

export const CLASSIFICATION = {
  /** A recommendation needs at least this reason confidence; below it goes to human review. */
  recommendationGate: 0.8,
  /** Below this confidence a classification is flagged `needs_review`. */
  reviewThreshold: 0.6,
} as const;

export const CURRENCY = {
  /** Fixed MVP assumption for USD-equivalent analytics (not a live rate). */
  lrdPerUsd: 190,
} as const;

/** Orange-owned feedback channels. Resolve AI hands requests to these; it never contacts customers. */
export const CHANNELS = [
  'voice_call',
  'sms',
  'ussd',
  'field_agent_interview',
  'customer_service',
  'facebook_comment',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  voice_call: 'Orange voice call',
  sms: 'Orange SMS',
  ussd: 'Orange USSD',
  field_agent_interview: 'Field agent interview',
  customer_service: 'Call centre',
  facebook_comment: 'Facebook page comment',
};
