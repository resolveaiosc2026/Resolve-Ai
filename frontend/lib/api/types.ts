/**
 * Response shapes of the Resolve AI API (camelCase, ISO timestamps).
 * Only the fields the workbench uses are declared. Source of truth:
 * docs/openapi.json.
 */
import type {
  EligibilityCheck,
  EligibilityRule,
  EvidenceItem,
  PriorityView,
  QueueStatus,
  ReasonCandidate,
  ReasonId,
  TimelineEvent,
  UsageView,
} from "../types";

export interface ApiHealth {
  status: "ok" | "degraded";
  environment: string;
  simulation: "on" | "off";
  database: { status: "up" | "down" };
}

export interface ApiDetectionRun {
  id: string;
  asOf: string;
  baselineWeeks: number;
  currentWeeks: number;
}

export interface ApiCustomer {
  id: string;
  segment: string;
  region: string;
  valueTier: "high" | "medium" | "low";
  tenureMonths: number;
  maskedMsisdn: string;
  daysSinceLastActivity: number;
  careContacts30d: number;
  networkFaultReports30d: number;
  baselineActivationsPerMonth: number;
  activationsPerMonthNow: number;
  queueStatus: QueueStatus;
  flaggedAt: string;
}

export interface ApiUsage extends Omit<UsageView, "weeks"> {
  weeks: { weekStart: string; gb: number }[];
}

export interface ApiQueueRow {
  caseId: string;
  customer: ApiCustomer;
  usage: ApiUsage;
  priority: PriorityView;
  status: QueueStatus;
  reasonLabel: string;
}

export interface ApiBand {
  key: string;
  label: string;
  band: "high" | "medium" | "low";
  count: number;
  pct: number;
}

export interface ApiDetectSummary {
  runId: string;
  flagged: number;
  subscribersScored: number;
  awaitingReply: number;
  readyForAction: number;
  actionsAwaitingApproval: number;
  minimumDaysInactive: number;
  pilotSample: number;
  historyRecoveryRate: number;
  bands: ApiBand[];
  simulated: boolean;
}

export interface ApiFeedback {
  requestId: string;
  askedAt: string;
  channel: string;
  channelId: string;
  question: string;
  replyReceived: boolean;
  repliedAt: string | null;
  classifiedBy: string | null;
  classifiedAt: string | null;
  verbatim: string | null;
}

export type NextStep = "classified" | "use_evidence" | "awaiting_reply" | "request_feedback" | "monitor";

export interface ApiClassification {
  caseId: string;
  classificationId: string | null;
  status: "classified" | "awaiting_reply" | "unclassified";
  primary: ReasonCandidate | null;
  alternatives: ReasonCandidate[];
  evidence: EvidenceItem[];
  feedback: ApiFeedback | null;
  source: string | null;
  review: { reasonId: ReasonId; reviewedBy: string; reviewedAt: string } | null;
  assessment: { nextStep: NextStep; reasonKnown: boolean };
}

export interface ApiAction {
  id: string;
  name: string;
  shortName: string;
  price: number;
  currency: "USD" | "LRD";
  sizeMb: number;
  validityHours: number;
  reasons: ReasonId[];
  mismatchNote: string;
  channel: string;
  channelId: string;
  window: string;
  body: string;
  eligibility: EligibilityRule[];
}

export interface ApiCandidate {
  action: ApiAction;
  predictedRecovery: number;
  eligible: boolean;
  checks: EligibilityCheck[];
  why: string;
  rejectedReason: string | null;
}

export interface ApiRecommendationSummary {
  id: string;
  actionId: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  predictedRecovery: number;
  createdAt: string;
}

export interface ApiRecommendationView {
  caseId: string;
  customerId: string;
  reason: ReasonCandidate | null;
  recommended: ApiCandidate | null;
  candidates: ApiCandidate[];
  notRecommended: ApiCandidate[];
  history: { reason: string; action: string; outcome: string }[];
  current: ApiRecommendationSummary | null;
}

export interface ApiInterventionRow {
  id: string;
  reference: string;
  recommendationId: string;
  caseId: string;
  customerId: string;
  action: { id: string; name: string; shortName: string };
  decision: string;
  channel: string;
  channelId: string;
  approvedBy: string;
  approvedAt: string;
  status: "approved" | "handed_off" | "delivered" | "failed" | "cancelled";
  handedOffAt: string | null;
  deliveredAt: string | null;
  simulatedThrough: string | null;
  hasOutcome: boolean;
}

export interface ApiOutcome {
  interventionId: string;
  customerId: string;
  windowDays: number;
  measuredAt: string;
  activationsAfter: number;
  baselineActivations: number;
  recovered: boolean;
  outcomeType: string;
  changePct: number;
  simulated: boolean;
  note: string;
}

export interface ApiMeasureIntervention {
  id: string;
  customerId: string;
  actionId: string;
  channel: string;
  draftedAt: string;
  approvedBy: string;
  approvedAt: string;
  sentAt: string | null;
  delivered: boolean;
  status: string;
  clickRecorded: boolean;
}

export interface ApiMeasureView {
  caseId: string;
  customerId: string;
  events: TimelineEvent[];
  outcome: ApiOutcome | null;
  intervention: ApiMeasureIntervention | null;
  action: ApiAction | null;
  verdict: "recovered" | "not_recovered" | "awaiting_window";
  activationsAfter: number | null;
  vsBaselinePct: number | null;
  controlSummary: { recovered: number; total: number; rate: number };
}

export interface ApiReviewRow {
  customerId: string;
  verbatim: string;
  aiReason: ReasonId;
  aiConfidence: number;
  analystReason: ReasonId;
  agreed: boolean;
  reviewedAt: string;
}

export interface ApiRate {
  recovered: number;
  n: number;
  rate: number;
  ci: { low: number; high: number };
}

export interface ApiReport {
  flagged: number;
  windowDays: number;
  churned: number;
  churnPct: number;
  approvalsThisWeek: number;
  approvalsTotal: number;
  marginImpactPct: number;
  awaitingReply: number;
  classified: number;
  reasons: { label: string; count: number; pct: number }[];
  treated: ApiRate;
  control: ApiRate;
  differencePoints: number;
  intervalsOverlap: boolean;
  agreement: { agreed: number; reviewed: number; pct: number; rows: ApiReviewRow[] };
  history: { reason: string; action: string; outcome: string }[];
  simulated: boolean;
}

export interface ApiCopilotAnswer {
  id: string;
  conversationId: string;
  question: string;
  intent: string;
  routedBy: "keywords" | "llm";
  answer: string;
  draftAnswer: string;
  phrasedBy: string;
  facts: { label: string; value: string; source: string }[];
  caveat?: string | null;
  followUps: string[];
}

export interface ApiApproveResult {
  decision: string;
  intervention: ApiInterventionRow;
}
