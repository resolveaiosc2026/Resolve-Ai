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

/** Understand: feedback hand-off to Orange channels. */
export const FEEDBACK = {
  /** An unanswered request older than this can be followed up on another channel (it becomes no_response). */
  replyWindowDays: 7,
  /** Orange channels Resolve AI can hand an ask to (inbound-only channels excluded). */
  outboundChannels: ['sms', 'voice_call', 'ussd', 'field_agent_interview'] as const,
  inboundChannels: ['customer_service', 'facebook_comment'] as const,
  questions: {
    sms: 'Orange: We noticed your bundle use dropped. Reply with one number: 1 Price 2 Network 3 Not using much 4 Using another line 5 Something else',
    voice_call:
      'Call script: We noticed you are buying fewer data bundles. Can you tell us in your own words what changed?',
    ussd: 'Orange: Bundle use dropped? 1 Price 2 Network 3 Not using much 4 Other line 5 Other',
    field_agent_interview:
      'Agent guide: Ask the customer why they buy fewer bundles now. Write their answer in their own words.',
  },
  maxTextLength: 1000,
} as const;

/** Recommend: next-best-action engine (ported from the prototype's recommendAction/evaluateRule). */
export const RECOMMEND = {
  /** Predicted recovery when campaign history has no row for reason × action. */
  fallbackRecovery: 0.2,
  /** Offers sent within this many days (either side of the run date) block a new discount. */
  priorOfferDays: 30,
  /** Regions where the Daily Mini bundle is stocked (synthetic). */
  stockedRegions: ['Monrovia', 'Sinkor', 'Paynesville'],
  /** Pilot price cap for affordability offers (USD). */
  priceCapUsd: 2,
  /** A line with no activity for this long is not an active plan. */
  inactivePlanDays: 90,
  /** Care contacts needed to count as consent to a care call. */
  consentCareContacts: 2,
} as const;

/** What each action is meant to achieve (stored with a recommendation). */
export const ACTION_OBJECTIVES: Record<string, string> = {
  daily_mini_600: 'Keep the customer buying at a price they can afford now',
  monthly_mini_2g: 'Move the customer back to a larger bundle within the pilot price cap',
  care_bridge: 'Get the network fault fixed so the customer can use data again',
  ussd_guide: 'Remove the activation barrier so the customer can buy their usual bundle',
  competitor_match: 'Keep the customer from moving their data spend to another network',
  reduced_need_checkin: 'Confirm the drop is a real change in need and avoid an unnecessary offer',
};

/** Measure: outcome window and the share-of-drop-recovered rule. */
export const MEASURE = {
  windowDays: 30,
  tolerancePct: 5,
  /** Share of the original drop recovered → outcome type. */
  reEngagedShare: 0.5,
  partialShare: 0.15,
  noChangeShare: -0.1,
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
