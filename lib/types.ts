/**
 * Resolve AI — shared types.
 *
 * Types describe the canonical prototype model (see docs/erd.md), not any
 * Orange production schema.
 */

export type ReasonId =
  | "affordability"
  | "reduced_need"
  | "competitor"
  | "network_quality"
  | "activation_difficulty"
  | "unknown";

export type QueueStatus =
  | "new"
  | "awaiting_reply"
  | "unclassified"
  | "ready"
  | "action_done";

export type ConfidenceBand = "high" | "medium" | "low";

export interface Reason {
  id: ReasonId;
  label: string;
  icon: string;
}

export interface Customer {
  id: string;
  segment: string;
  region: string;
  value_tier: "High" | "Medium" | "Low";
  tenure_months: number;
  masked_msisdn: string;
  days_since_last_activity: number;
  care_contacts_30d: number;
  network_fault_reports_30d: number;
  baseline_activations_per_month: number;
  activations_per_month_now: number;
  queue_status: QueueStatus;
  flagged_at: string;
}

export interface WeekPoint {
  week_start: string;
  gb: number;
}

export interface ActivitySeries {
  weeks: WeekPoint[];
  baseline_window_weeks: number;
  current_window_weeks: number;
}

export interface FeedbackEntry {
  case_id: string;
  asked_at: string;
  channel: string;
  question: string;
  reply_received: boolean;
  replied_at: string | null;
  classified_by: string | null;
  classified_at: string | null;
  verbatim: string | null;
}

export interface EligibilityRule {
  code: string;
  label: string;
}

export interface Action {
  id: string;
  name: string;
  short_name: string;
  price_usd: number;
  size_mb: number;
  validity_hours: number;
  reasons: ReasonId[];
  /** Shown when the action is offered for a reason it was not built for. */
  mismatch_note: string;
  predicted_recovery: number;
  channel: string;
  window: string;
  body: string;
  eligibility: EligibilityRule[];
}

export interface CampaignRow {
  reason: ReasonId;
  action_id: string;
  recovery_rate: number;
  n: number;
}

export interface Intervention {
  id: string;
  case_id: string;
  action_id: string;
  channel: string;
  drafted_at: string;
  approved_by: string;
  approved_at: string;
  sent_at: string;
  delivered: boolean;
  click_recorded: boolean;
}

export interface OutcomeRow {
  intervention_id: string;
  case_id: string;
  window_days: number;
  measured_at: string;
  activations_after: number;
  baseline_activations: number;
  recovered: boolean;
  note: string;
}

export interface ControlRow {
  id: string;
  matched_case_id: string | null;
  tolerance_pct: number;
  window_days: number;
  recovered: boolean;
}

export interface ReviewRow {
  case_id: string;
  verbatim: string;
  ai_reason: ReasonId;
  analyst_reason: ReasonId;
  agreed: boolean;
  reviewed_at: string;
}

export interface DetectionRun {
  run_id: string;
  run_at: string;
  window_days: number;
  subscribers_scored: number;
  flagged_total: number;
  risk_bands: { high: number; medium: number; low: number };
  awaiting_reply: number;
  ready_for_action: number;
  actions_awaiting_approval: number;
  minimum_days_inactive: number;
  pilot_sample_size: number;
  pilot_window_days: number;
  churned_case_ids: string[];
  margin_impact_change_pct: number;
  approvals_this_week: number;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Derived view models (what the screens render)                        */
/* ------------------------------------------------------------------ */

export interface UsageView {
  weeks: WeekPoint[];
  baselineGb: number;
  currentGb: number;
  changePct: number;
  dropPct: number;
  baselineActivations: number;
  currentActivations: number;
  bandLowGb: number;
  bandHighGb: number;
}

export interface ScoreContribution {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface PriorityView {
  total: number;
  band: ConfidenceBand;
  contributions: ScoreContribution[];
}

export interface ReasonCandidate {
  id: ReasonId;
  label: string;
  icon: string;
  confidence: number;
}

export interface EvidenceItem {
  kind: "behavioural" | "usage" | "exclusion";
  title: string;
  body: string;
}

export interface ClassificationView {
  status: "classified" | "awaiting_reply" | "unclassified";
  primary: ReasonCandidate | null;
  alternatives: ReasonCandidate[];
  evidence: EvidenceItem[];
  feedback: FeedbackEntry | null;
}

export interface EligibilityCheck {
  code: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ActionCandidate {
  action: Action;
  predictedRecovery: number;
  eligible: boolean;
  checks: EligibilityCheck[];
  why: string;
  rejectedReason: string | null;
}

export interface RecommendationView {
  reason: ReasonCandidate | null;
  candidates: ActionCandidate[];
  recommended: ActionCandidate | null;
  notRecommended: ActionCandidate[];
  history: { reason: string; action: string; outcome: string }[];
}

export interface TimelineEvent {
  label: string;
  detail: string;
  at: string;
  system: string;
}

export interface MeasureView {
  events: TimelineEvent[];
  outcome: OutcomeRow | null;
  intervention: Intervention | null;
  action: Action | null;
  verdict: "recovered" | "not_recovered" | "awaiting_window";
  activationsAfter: number | null;
  vsBaselinePct: number | null;
  controlSummary: { recovered: number; total: number; rate: number };
}

export interface QueueRow {
  customer: Customer;
  usage: UsageView;
  priority: PriorityView;
  status: QueueStatus;
  reasonLabel: string;
}
