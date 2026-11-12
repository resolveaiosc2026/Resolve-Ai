/**
 * Map API responses (camelCase, ISO timestamps) onto the view models in
 * lib/types.ts, so the screens keep rendering the shapes they were built for.
 */
import type {
  Action,
  ActionCandidate,
  ClassificationView,
  Customer,
  FeedbackEntry,
  Intervention,
  MeasureView,
  OutcomeRow,
  QueueRow,
  RecommendationView,
  ReviewRow,
  TimelineEvent,
  UsageView,
} from "../types";
import type {
  ApiAction,
  ApiCandidate,
  ApiClassification,
  ApiCustomer,
  ApiFeedback,
  ApiMeasureIntervention,
  ApiMeasureView,
  ApiOutcome,
  ApiQueueRow,
  ApiRecommendationView,
  ApiReport,
  ApiReviewRow,
  ApiUsage,
} from "./types";

/** Fixed LRD→USD rate used by the backend for USD-equivalents (backend/README.md). */
const LRD_PER_USD = 190;

/**
 * ISO timestamp → "YYYY-MM-DD HH:mm" in UTC, the format lib/analytics.ts
 * formatStamp() reads. Keeps displayed times identical to the dataset's.
 */
export function stamp(iso: string): string;
export function stamp(iso: string | null): string | null;
export function stamp(iso: string | null): string | null {
  if (!iso) return null;
  return iso.length >= 16 ? iso.slice(0, 16).replace("T", " ") : iso;
}

const TIER = { high: "High", medium: "Medium", low: "Low" } as const;

export function toCustomer(c: ApiCustomer): Customer {
  return {
    id: c.id,
    segment: c.segment,
    region: c.region,
    value_tier: TIER[c.valueTier],
    tenure_months: c.tenureMonths,
    masked_msisdn: c.maskedMsisdn,
    days_since_last_activity: c.daysSinceLastActivity,
    care_contacts_30d: c.careContacts30d,
    network_fault_reports_30d: c.networkFaultReports30d,
    baseline_activations_per_month: c.baselineActivationsPerMonth,
    activations_per_month_now: c.activationsPerMonthNow,
    queue_status: c.queueStatus,
    flagged_at: stamp(c.flaggedAt),
  };
}

export function toUsage(u: ApiUsage): UsageView {
  return { ...u, weeks: u.weeks.map((w) => ({ week_start: w.weekStart, gb: w.gb })) };
}

export function toQueueRow(r: ApiQueueRow): QueueRow & { caseId: string } {
  return {
    caseId: r.caseId,
    customer: toCustomer(r.customer),
    usage: toUsage(r.usage),
    priority: r.priority,
    status: r.status,
    reasonLabel: r.reasonLabel,
  };
}

export function toAction(a: ApiAction, predictedRecovery = 0): Action & { channelId: string } {
  return {
    id: a.id,
    name: a.name,
    short_name: a.shortName,
    price_usd: a.currency === "USD" ? a.price : Math.round((a.price / LRD_PER_USD) * 100) / 100,
    size_mb: a.sizeMb,
    validity_hours: a.validityHours,
    reasons: a.reasons,
    mismatch_note: a.mismatchNote,
    predicted_recovery: predictedRecovery,
    channel: a.channel,
    channelId: a.channelId,
    window: a.window,
    body: a.body,
    eligibility: a.eligibility,
  };
}

function toCandidate(c: ApiCandidate): ActionCandidate {
  return {
    action: toAction(c.action, c.predictedRecovery),
    predictedRecovery: c.predictedRecovery,
    eligible: c.eligible,
    checks: c.checks,
    why: c.why,
    rejectedReason: c.rejectedReason,
  };
}

export function toRecommendation(r: ApiRecommendationView): RecommendationView & {
  caseId: string;
  current: ApiRecommendationView["current"];
} {
  return {
    caseId: r.caseId,
    reason: r.reason,
    candidates: r.candidates.map(toCandidate),
    recommended: r.recommended ? toCandidate(r.recommended) : null,
    notRecommended: r.notRecommended.map(toCandidate),
    history: r.history,
    current: r.current,
  };
}

export function toFeedback(f: ApiFeedback, customerId: string): FeedbackEntry & { requestId: string } {
  return {
    requestId: f.requestId,
    case_id: customerId,
    asked_at: stamp(f.askedAt),
    channel: f.channel,
    question: f.question,
    reply_received: f.replyReceived,
    replied_at: stamp(f.repliedAt),
    classified_by: f.classifiedBy,
    classified_at: stamp(f.classifiedAt),
    verbatim: f.verbatim,
  };
}

export type ClassificationResult = ClassificationView & {
  caseId: string;
  classificationId: string | null;
  source: string | null;
  review: ApiClassification["review"];
  nextStep: ApiClassification["assessment"]["nextStep"];
  feedback: (FeedbackEntry & { requestId: string }) | null;
};

export function toClassification(c: ApiClassification, customerId: string): ClassificationResult {
  return {
    caseId: c.caseId,
    classificationId: c.classificationId,
    status: c.status,
    primary: c.primary,
    alternatives: c.alternatives,
    evidence: c.evidence,
    feedback: c.feedback ? toFeedback(c.feedback, customerId) : null,
    source: c.source,
    review: c.review,
    nextStep: c.assessment.nextStep,
  };
}

function toOutcome(o: ApiOutcome): OutcomeRow {
  return {
    intervention_id: o.interventionId,
    case_id: o.customerId,
    window_days: o.windowDays,
    measured_at: stamp(o.measuredAt),
    activations_after: o.activationsAfter,
    baseline_activations: o.baselineActivations,
    recovered: o.recovered,
    note: o.note,
  };
}

function toIntervention(i: ApiMeasureIntervention): Intervention {
  return {
    id: i.id,
    case_id: i.customerId,
    action_id: i.actionId,
    channel: i.channel,
    drafted_at: stamp(i.draftedAt),
    approved_by: i.approvedBy,
    approved_at: stamp(i.approvedAt),
    sent_at: stamp(i.sentAt) ?? "",
    delivered: i.delivered,
    click_recorded: i.clickRecorded,
  };
}

export function toMeasure(m: ApiMeasureView): MeasureView {
  return {
    events: m.events.map((e): TimelineEvent => ({ ...e, at: stamp(e.at) })),
    outcome: m.outcome ? toOutcome(m.outcome) : null,
    intervention: m.intervention ? toIntervention(m.intervention) : null,
    action: m.action ? toAction(m.action) : null,
    verdict: m.verdict,
    activationsAfter: m.activationsAfter,
    vsBaselinePct: m.vsBaselinePct,
    controlSummary: m.controlSummary,
  };
}

function toReview(r: ApiReviewRow): ReviewRow & { ai_confidence: number } {
  return {
    case_id: r.customerId,
    verbatim: r.verbatim,
    ai_reason: r.aiReason,
    ai_confidence: r.aiConfidence,
    analyst_reason: r.analystReason,
    agreed: r.agreed,
    reviewed_at: stamp(r.reviewedAt),
  };
}

export function toReport(r: ApiReport) {
  return { ...r, agreement: { ...r.agreement, rows: r.agreement.rows.map(toReview) } };
}
export type ReportView = ReturnType<typeof toReport>;
