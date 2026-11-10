/**
 * OpenAPI component schemas for response bodies (JSON Schema 2020-12, as used by OpenAPI 3.1).
 * Request schemas are NOT written here: they are generated from the Zod validators.
 */
type Schema = Record<string, unknown>;

const s = (extra: Schema = {}): Schema => ({ type: 'string', ...extra });
const i = (extra: Schema = {}): Schema => ({ type: 'integer', ...extra });
const n = (extra: Schema = {}): Schema => ({ type: 'number', ...extra });
const b = (extra: Schema = {}): Schema => ({ type: 'boolean', ...extra });
const arr = (items: Schema, extra: Schema = {}): Schema => ({ type: 'array', items, ...extra });
export const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const orNull = (schema: Schema): Schema =>
  '$ref' in schema
    ? { anyOf: [schema, { type: 'null' }] }
    : { ...schema, type: [schema.type, 'null'] };
const obj = (
  properties: Record<string, Schema>,
  required: string[] = Object.keys(properties),
): Schema => ({
  type: 'object',
  properties,
  required,
});
const date = (description?: string) =>
  s({ format: 'date-time', ...(description ? { description } : {}) });
const uuid = (description?: string) =>
  s({ format: 'uuid', ...(description ? { description } : {}) });

const BAND = s({ enum: ['high', 'medium', 'low'] });
const QUEUE_STATUS = s({
  enum: ['new', 'awaiting_reply', 'unclassified', 'ready', 'action_done', 'closed'],
});
const REASON_ID = s({
  enum: [
    'affordability',
    'reduced_need',
    'competitor',
    'network_quality',
    'activation_difficulty',
    'unknown',
  ],
});
const CHANNEL = s({
  enum: [
    'voice_call',
    'sms',
    'ussd',
    'field_agent_interview',
    'customer_service',
    'facebook_comment',
  ],
});

export const componentSchemas: Record<string, Schema> = {
  Error: obj({
    error: obj(
      {
        code: s({
          description: 'Stable machine-readable code',
          examples: ['VALIDATION_ERROR', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED'],
        }),
        message: s(),
        details: arr(obj({ path: s(), message: s() }, ['message'])),
      },
      ['code', 'message'],
    ),
  }),
  PageMeta: obj({
    page: i({ minimum: 1 }),
    pageSize: i({ minimum: 1, maximum: 100 }),
    total: i({ minimum: 0 }),
  }),

  /* System */
  ServiceInfo: obj({
    service: s(),
    description: s(),
    version: s(),
    environment: s({ enum: ['development', 'production'] }),
    simulation: s({ enum: ['on', 'off'] }),
    links: obj({ docs: s(), openapi: s(), health: s() }),
  }),
  Health: obj({
    status: s({ enum: ['ok', 'degraded'] }),
    service: s(),
    environment: s(),
    simulation: s({ enum: ['on', 'off'] }),
    uptimeSeconds: i(),
    timestamp: date(),
    database: obj({ status: s({ enum: ['up', 'down'] }), latencyMs: i() }, ['status']),
  }),

  /* Detect */
  Customer: obj({
    id: s({ pattern: '^LR-\\d{5}$', examples: ['LR-20417'] }),
    segment: s(),
    region: s(),
    valueTier: BAND,
    tenureMonths: i(),
    maskedMsisdn: s({ description: 'Masked phone number (synthetic)' }),
    daysSinceLastActivity: i(),
    careContacts30d: i(),
    networkFaultReports30d: i(),
    baselineActivationsPerMonth: i(),
    activationsPerMonthNow: i(),
    queueStatus: QUEUE_STATUS,
    flaggedAt: date(),
  }),
  WeekPoint: obj({ weekStart: s({ format: 'date' }), gb: n() }),
  Usage: obj({
    weeks: arr(ref('WeekPoint'), { description: '12 weeks: 8 baseline + 4 current' }),
    baselineGb: n({ description: 'GB per month, baseline weeks' }),
    currentGb: n({ description: 'GB per month, current weeks' }),
    changePct: i(),
    dropPct: n({ minimum: 0, maximum: 1 }),
    bandLowGb: n(),
    bandHighGb: n(),
    baselineActivations: i(),
    currentActivations: i(),
  }),
  ScoreContribution: obj({ key: s(), label: s(), points: i(), max: i(), detail: s() }),
  Priority: obj({
    total: i({ minimum: 0, maximum: 93 }),
    band: BAND,
    contributions: arr(ref('ScoreContribution')),
  }),
  QueueRow: obj({
    caseId: uuid(),
    customer: ref('Customer'),
    usage: ref('Usage'),
    priority: ref('Priority'),
    status: QUEUE_STATUS,
    reasonLabel: s({ description: '"Awaiting reply" until a reason exists' }),
  }),
  BandCount: obj({ key: BAND, label: s(), band: BAND, count: i(), pct: i() }),
  DetectSummary: obj({
    runId: orNull(s()),
    flagged: i(),
    subscribersScored: i(),
    awaitingReply: i(),
    readyForAction: i(),
    actionsAwaitingApproval: i(),
    minimumDaysInactive: i(),
    pilotSample: i(),
    historyRecoveryRate: i({ description: 'Percent, weighted campaign history (synthetic)' }),
    bands: arr(ref('BandCount')),
    simulated: b({ description: 'True when the top-level figures are the synthetic population' }),
    pilot: obj({
      total: i(),
      bands: arr(ref('BandCount')),
      statuses: { type: 'object', additionalProperties: i() },
    }),
  }),
  Segments: obj({
    bands: arr(obj({ id: BAND, label: s(), minScore: i(), count: i(), pct: i() })),
    population: orNull(
      obj({
        simulated: b(),
        flagged: i(),
        bands: arr(obj({ id: BAND, label: s(), count: i(), pct: i() })),
      }),
    ),
    bySegment: arr(obj({ segment: s(), count: i(), avgPriority: n() })),
  }),
  DetectionRun: obj({
    id: s({ examples: ['RUN-2026-10-28-01'] }),
    asOf: date(),
    modelVersion: s(),
    baselineWeeks: i(),
    currentWeeks: i(),
    customersScored: i(),
    casesInRun: i(),
    hasSimulatedPopulation: b(),
  }),
  RunSummary: obj({
    id: s(),
    asOf: date(),
    modelVersion: s(),
    customersScored: i(),
    flagged: i(),
    newCases: i(),
    updatedCases: i(),
    bands: obj({ high: i(), medium: i(), low: i() }),
  }),
  Metrics: obj({
    activations: i(),
    dataGb: n(),
    spendUsd: n(),
    spendLrd: n(),
    spendUsdEquivalent: n({ description: 'USD + LRD at a fixed configured rate (assumption)' }),
    activeDays: i(),
    failedActivationRate: n(),
    daysSinceLastActivity: i(),
  }),
  CustomerDetail: {
    allOf: [
      ref('QueueRow'),
      obj({ metrics: obj({ baseline: orNull(ref('Metrics')), current: orNull(ref('Metrics')) }) }),
    ],
  },
  CustomerListItem: obj({
    caseId: uuid(),
    customer: ref('Customer'),
    priority: obj({ total: i(), band: BAND }),
    status: QUEUE_STATUS,
    reasonLabel: s(),
  }),

  /* Understand */
  ReasonCandidate: obj({
    id: REASON_ID,
    label: s(),
    icon: s(),
    confidence: n({ minimum: 0, maximum: 1 }),
  }),
  EvidenceItem: obj({
    kind: s({ enum: ['behavioural', 'usage', 'exclusion'] }),
    title: s(),
    body: s(),
  }),
  FeedbackEntry: obj({
    requestId: uuid(),
    askedAt: date(),
    channel: s({ description: 'Display label, e.g. "Orange SMS"' }),
    channelId: CHANNEL,
    question: s(),
    replyReceived: b(),
    repliedAt: orNull(date()),
    classifiedBy: orNull(s()),
    classifiedAt: orNull(date()),
    verbatim: orNull(s({ description: "The customer's own words" })),
  }),
  EvidenceSignal: obj({
    reasonId: REASON_ID,
    label: s(),
    strength: n({ minimum: 0, maximum: 1 }),
    detail: s(),
  }),
  Assessment: obj({
    nextStep: s({
      enum: ['classified', 'use_evidence', 'awaiting_reply', 'request_feedback', 'monitor'],
    }),
    reasonKnown: b(),
    signals: arr(ref('EvidenceSignal')),
  }),
  ClassificationView: obj({
    caseId: uuid(),
    classificationId: orNull(uuid('Use with PATCH /reasons/{classificationId}')),
    status: s({ enum: ['classified', 'awaiting_reply', 'unclassified'] }),
    primary: orNull(ref('ReasonCandidate')),
    alternatives: arr(ref('ReasonCandidate')),
    evidence: arr(ref('EvidenceItem')),
    feedback: orNull(ref('FeedbackEntry')),
    source: orNull(s({ enum: ['feedback', 'evidence', 'human'] })),
    review: orNull(obj({ reasonId: REASON_ID, reviewedBy: s(), reviewedAt: date() })),
    assessment: ref('Assessment'),
  }),
  FeedbackRequestRow: obj({
    id: uuid(),
    caseId: uuid(),
    customerId: s(),
    segment: s(),
    region: s(),
    priority: obj({ total: i(), band: BAND }),
    queueStatus: QUEUE_STATUS,
    channel: s(),
    channelId: CHANNEL,
    question: s(),
    status: s({ enum: ['pending', 'handed_off', 'responded', 'no_response'] }),
    triggerReason: s({ enum: ['no_evidence', 'low_confidence'] }),
    createdAt: date(),
    handedOffAt: orNull(date()),
    respondedAt: orNull(date()),
    reply: orNull(obj({ text: s(), receivedAt: date() })),
  }),
  FeedbackSuggestion: obj({
    caseId: uuid(),
    customerId: s(),
    segment: s(),
    region: s(),
    valueTier: BAND,
    priority: obj({ total: i(), band: BAND }),
    queueStatus: QUEUE_STATUS,
    suggestedChannel: CHANNEL,
    channelLabel: s(),
    trigger: s({ enum: ['no_evidence', 'low_confidence'] }),
    signals: arr(ref('EvidenceSignal')),
  }),
  HandOffResult: obj({
    id: uuid(),
    caseId: uuid(),
    customerId: s(),
    channel: s(),
    channelId: CHANNEL,
    question: s(),
    status: s({ enum: ['handed_off'] }),
    triggerReason: s({ enum: ['no_evidence', 'low_confidence'] }),
    handedOffAt: date(),
    handedOffBy: s(),
    previousRequestsMarkedNoResponse: i(),
    note: s(),
  }),
  ReplyResult: obj(
    {
      stored: s({ enum: ['reply_and_reason', 'reply_only'] }),
      classifiedBy: s({ description: '`llm:<model>` or `keyword_fallback`' }),
      reasons: ref('ClassificationView'),
      simulated: b(),
    },
    ['stored', 'classifiedBy', 'reasons'],
  ),
  InboundResult: obj({
    id: orNull(uuid()),
    channel: s(),
    channelId: CHANNEL,
    customerId: orNull(s()),
    caseId: orNull(uuid()),
    region: orNull(s()),
    preview: obj({
      reasonId: REASON_ID,
      confidence: n(),
      sentiment: orNull(s({ enum: ['negative', 'neutral', 'positive'] })),
      summary: s(),
      classifiedBy: s(),
    }),
    note: s(),
  }),

  /* Recommend */
  EligibilityCheck: obj({ code: s(), label: s(), passed: b(), detail: s() }),
  Action: obj({
    id: s({ examples: ['daily_mini_600'] }),
    name: s(),
    shortName: s(),
    price: n(),
    currency: s({ enum: ['USD', 'LRD'] }),
    sizeMb: i(),
    validityHours: i(),
    reasons: arr(REASON_ID),
    mismatchNote: s(),
    channel: s(),
    channelId: CHANNEL,
    window: s(),
    body: s({ description: 'Message text Orange would send (Resolve AI never sends it)' }),
    eligibility: arr(obj({ code: s(), label: s() })),
  }),
  ActionCandidate: obj({
    action: ref('Action'),
    predictedRecovery: n({ minimum: 0, maximum: 1 }),
    eligible: b(),
    checks: arr(ref('EligibilityCheck')),
    why: s(),
    rejectedReason: orNull(s()),
  }),
  RecommendationView: obj({
    caseId: uuid(),
    customerId: s(),
    reason: orNull(ref('ReasonCandidate')),
    recommended: orNull(ref('ActionCandidate')),
    candidates: arr(ref('ActionCandidate')),
    notRecommended: arr(ref('ActionCandidate')),
    history: arr(obj({ reason: s(), action: s(), outcome: s() })),
    current: orNull(
      obj({
        id: uuid(),
        actionId: s(),
        status: s({ enum: ['pending', 'approved', 'rejected', 'superseded'] }),
        predictedRecovery: n(),
        createdAt: date(),
      }),
    ),
  }),
  Recommendation: obj({
    id: uuid(),
    caseId: uuid(),
    customerId: s(),
    action: obj({ id: s(), name: s(), shortName: s() }),
    predictedRecovery: n(),
    rationale: s(),
    objective: s(),
    eligibilityChecks: arr(ref('EligibilityCheck')),
    alternatives: arr(
      obj({ actionId: s(), predictedRecovery: n(), eligible: b(), rejectedReason: orNull(s()) }),
    ),
    status: s({ enum: ['pending', 'approved', 'rejected', 'superseded'] }),
    decidedBy: orNull(s()),
    decidedAt: orNull(date()),
    decisionNote: orNull(s()),
    createdAt: date(),
    intervention: orNull(obj({ id: uuid(), reference: s(), recommendationId: uuid() })),
  }),

  /* Act */
  Intervention: obj({
    id: uuid(),
    reference: s({ examples: ['INT-4106'] }),
    recommendationId: uuid(),
    caseId: uuid(),
    customerId: s(),
    action: obj({ id: s(), name: s(), shortName: s() }),
    recommendedActionId: s(),
    decision: s({ enum: ['approved', 'changed'] }),
    channel: s(),
    channelId: CHANNEL,
    deliveryWindow: orNull(s()),
    approvedBy: s(),
    approvedAt: date(),
    status: s({ enum: ['approved', 'handed_off', 'delivered', 'failed', 'cancelled'] }),
    handedOffAt: orNull(date()),
    deliveredAt: orNull(date()),
    clickRecorded: b(),
    note: orNull(s()),
    simulatedThrough: orNull(date('Demo only')),
    hasOutcome: b(),
  }),
  ApproveResult: obj({
    decision: s({ enum: ['approved', 'changed'] }),
    intervention: ref('Intervention'),
  }),
  RejectResult: obj({
    recommendationId: uuid(),
    status: s({ enum: ['rejected'] }),
    caseStatus: s({ enum: ['unclassified'] }),
  }),

  /* Measure */
  SimulationAdvance: obj({
    reference: s(),
    scenario: s({ enum: ['recover', 'partial', 'no_change', 'decline'] }),
    simulatedPurchases: i(),
    windowEnd: date(),
    simulated: b(),
  }),
  Outcome: obj({
    id: uuid(),
    interventionId: s({ description: 'Intervention reference (INT-…)' }),
    customerId: orNull(s()),
    windowDays: i(),
    baselineActivations: i(),
    activationsAfter: i(),
    changePct: i(),
    shareOfDropRecovered: n(),
    outcomeType: s({ enum: ['re_engaged', 'partially_engaged', 'no_change', 'declined_further'] }),
    recovered: b(),
    simulated: b(),
    note: orNull(s()),
    measuredAt: date(),
  }),
  TimelineEvent: obj({ label: s(), detail: s(), at: date(), system: s() }),
  MeasureView: obj({
    caseId: uuid(),
    customerId: s(),
    events: arr(ref('TimelineEvent')),
    outcome: orNull({ type: 'object', additionalProperties: true }),
    intervention: orNull({ type: 'object', additionalProperties: true }),
    action: orNull(ref('Action')),
    verdict: s({ enum: ['recovered', 'not_recovered', 'awaiting_window'] }),
    activationsAfter: orNull(i()),
    vsBaselinePct: orNull(i()),
    controlSummary: obj({ recovered: i(), total: i(), rate: n() }),
  }),

  /* Report */
  Cohort: obj({
    recovered: i(),
    n: i(),
    rate: n(),
    ci: obj({ low: n(), high: n() }, ['low', 'high']),
  }),
  ReportSummary: obj({
    flagged: i(),
    windowDays: i(),
    churned: i(),
    churnPct: n(),
    approvalsThisWeek: i(),
    approvalsTotal: i(),
    marginImpactPct: n(),
    awaitingReply: i(),
    classified: i(),
    reasons: arr(obj({ label: s(), count: i(), pct: i() })),
    treated: ref('Cohort'),
    control: ref('Cohort'),
    differencePoints: i(),
    intervalsOverlap: b(),
    agreement: obj({
      agreed: i(),
      reviewed: i(),
      pct: i(),
      rows: arr({ type: 'object', additionalProperties: true }),
    }),
    history: arr(obj({ reason: s(), action: s(), outcome: s() })),
    simulated: b(),
  }),
  Drivers: obj({
    reasons: arr(
      obj({
        id: REASON_ID,
        label: s(),
        count: i(),
        pct: i(),
        bySource: obj({ feedback: i(), evidence: i(), human: i() }),
      }),
    ),
    coverage: obj({
      openCases: i(),
      classified: i(),
      unknown: i(),
      needsReview: i(),
      asked: i(),
      answered: i(),
      unanswered: i(),
      noReasonYet: i(),
    }),
  }),
  ActionsReport: obj({
    actions: arr(
      obj({
        id: s(),
        name: s(),
        recommended: i(),
        approved: i(),
        changedTo: i(),
        rejected: i(),
        delivered: i(),
        measured: i(),
        recovered: i(),
      }),
    ),
    campaignHistory: arr(
      obj({
        reasonId: REASON_ID,
        actionId: s(),
        action: s(),
        recoveryRate: n(),
        n: i(),
        simulated: b(),
      }),
    ),
  }),
  Trends: obj({
    asOf: date(),
    since: s({ format: 'date' }),
    weeks: arr(
      obj({
        weekStart: s({ format: 'date' }),
        period: s({ enum: ['baseline', 'current'] }),
        customers: i(),
        avgGb: n(),
      }),
    ),
  }),

  /* Copilot */
  CopilotFact: obj({
    label: s(),
    value: s(),
    source: s({ description: 'Where the fact came from' }),
  }),
  CopilotAnswer: obj({
    id: uuid(),
    conversationId: uuid(),
    question: s(),
    intent: s({
      enum: [
        'customer',
        'pilot',
        'population',
        'segment',
        'reasons',
        'action',
        'approvals',
        'trust',
        'unknown',
      ],
    }),
    routedBy: s({ enum: ['keywords', 'llm'] }),
    answer: s({ description: 'Final answer (AI-phrased or the template)' }),
    draftAnswer: s({ description: 'Deterministic template answer' }),
    phrasedBy: s({ description: '`template` or `llm:<model>`' }),
    facts: arr(ref('CopilotFact')),
    caveat: orNull(s()),
    followUps: arr(s()),
    createdAt: date(),
  }),
  Conversation: obj({ conversationId: uuid(), turns: arr(ref('CopilotAnswer')) }),
};
