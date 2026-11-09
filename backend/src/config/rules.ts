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

/**
 * Understand: behavioural evidence rules (current 30-day window). A reason is "known"
 * from evidence alone when its strength reaches CLASSIFICATION.recommendationGate.
 */
export const EVIDENCE = {
  modelVersion: 'rules:evidence-v1',
  activation: {
    strong: { minFailed: 3, minFailedRate: 0.3, strength: 0.85 },
    medium: { minFailed: 2, strength: 0.6 },
  },
  network: {
    /** Regional incident overlapping the window AND at least one own fault report. */
    incidentAndReport: 0.85,
    /** Regional incident only, or at least `manyReports` own fault reports. */
    incidentOrReports: 0.65,
    manyReports: 2,
    singleReport: 0.4,
  },
  affordability: {
    /** Average price per bundle (USD-equivalent) fell to this share of baseline or less. */
    tradeDownRatio: 0.7,
    /** Never strong: affordability needs the customer's own words. */
    strength: 0.55,
  },
} as const;

/** Channel suggested for a feedback request (Orange owns the channel; Resolve AI only suggests). */
export const SUGGESTED_CHANNEL = {
  highTouch: 'voice_call',
  default: 'sms',
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
