/**
 * Workflow history: feedback asks handed off to Orange SMS, replies, classifications
 * (keyword classifier, as the prototype computes them), and the September 2026 pilot:
 * approved recommendations, interventions, treated outcomes and matched controls.
 */
import { randomUUID } from 'node:crypto';

import { CLASSIFICATION } from '../../config/rules.js';
import type { UsageSummary } from '../../modules/detect/scoring.js';
import {
  classificationEvidence,
  classifyText,
  type ReasonId,
} from '../../modules/understand/keyword-classifier.js';
import type {
  customerFeedback,
  feedbackRequests,
  interventions,
  outcomes,
  reasonClassifications,
  recommendations,
} from '../schema/index.js';
import { ACTION_OBJECTIVES, toChannel } from './catalog.js';
import { ANALYST, RUN_DATE, parseStamp, type PilotDataset } from './pilot-dataset.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export type HistoryRows = {
  feedbackRequests: Row<typeof feedbackRequests>[];
  replies: Row<typeof customerFeedback>[];
  classifications: Row<typeof reasonClassifications>[];
  recommendations: Row<typeof recommendations>[];
  interventions: Row<typeof interventions>[];
  outcomes: Row<typeof outcomes>[];
};

type Context = {
  caseIdByCustomer: Map<string, string>;
  usageByCustomer: Map<string, UsageSummary>;
};

type OutcomeType = 're_engaged' | 'partially_engaged' | 'no_change' | 'declined_further';

/** recovered → re_engaged; otherwise compare with the activation level at which the case was flagged. */
function outcomeType(recovered: boolean, after: number, flaggedLevel: number): OutcomeType {
  if (recovered) return 're_engaged';
  if (after > flaggedLevel) return 'partially_engaged';
  if (after === flaggedLevel) return 'no_change';
  return 'declined_further';
}

const changeVsBaseline = (after: number, baseline: number) =>
  baseline > 0 ? Math.round((after / baseline - 1) * 100) : 0;

export function buildHistory(data: PilotDataset, ctx: Context): HistoryRows {
  const rows: HistoryRows = {
    feedbackRequests: [],
    replies: [],
    classifications: [],
    recommendations: [],
    interventions: [],
    outcomes: [],
  };
  const reasonOrder = data.reasons.map((r) => r.id);
  const reasonLabel = new Map(data.reasons.map((r) => [r.id, r.label]));
  const customerById = new Map(data.customers.map((c) => [c.id, c]));
  const classificationByCustomer = new Map<string, { id: string; reasonId: ReasonId }>();

  const caseIdOf = (customerId: string) => {
    const id = ctx.caseIdByCustomer.get(customerId);
    if (!id) throw new Error(`No case for ${customerId}`);
    return id;
  };

  /* ---------------- Understand: asks, replies, classifications ---------------- */
  for (const c of data.customers) {
    const fb = data.feedback[c.id];
    if (!fb) continue;
    const caseId = caseIdOf(c.id);
    const requestId = randomUUID();

    rows.feedbackRequests.push({
      id: requestId,
      caseId,
      channel: toChannel(fb.channel),
      question: fb.question,
      triggerReason: 'no_evidence',
      status: fb.reply_received ? 'responded' : 'handed_off',
      createdAt: parseStamp(fb.asked_at),
      handedOffAt: parseStamp(fb.asked_at),
      respondedAt: fb.replied_at ? parseStamp(fb.replied_at) : null,
    });

    if (!fb.reply_received || !fb.verbatim || !fb.replied_at) continue;

    const replyId = randomUUID();
    rows.replies.push({
      id: replyId,
      customerId: c.id,
      caseId,
      feedbackRequestId: requestId,
      channel: toChannel(fb.channel),
      region: c.region,
      rawText: fb.verbatim,
      simulated: true,
      receivedAt: parseStamp(fb.replied_at),
    });

    const usage = ctx.usageByCustomer.get(c.id);
    if (!usage) throw new Error(`No usage summary for ${c.id}`);
    const result = classifyText(
      fb.verbatim,
      {
        dropPct: usage.dropPct,
        tenureMonths: c.tenure_months,
        careContacts30d: c.care_contacts_30d,
        networkFaultReports30d: c.network_fault_reports_30d,
        activationsNow: c.activations_per_month_now,
      },
      reasonOrder,
    );
    const review = data.reviews.find((r) => r.case_id === c.id);
    const classificationId = randomUUID();
    const pct = Math.round(result.primary.confidence * 100);

    rows.classifications.push({
      id: classificationId,
      caseId,
      feedbackId: replyId,
      reasonId: result.primary.reasonId,
      confidence: result.primary.confidence,
      alternatives: result.alternatives,
      sentiment: null,
      summary: `The customer's reply points to ${reasonLabel.get(result.primary.reasonId as ReasonId)?.toLowerCase()} (${pct}% confidence, keyword classifier).`,
      evidence: classificationEvidence({
        verbatim: fb.verbatim,
        activationsNow: c.activations_per_month_now,
        baselineActivations: c.baseline_activations_per_month,
        changePct: usage.changePct,
        networkFaultReports30d: c.network_fault_reports_30d,
        daysSinceLastActivity: c.days_since_last_activity,
        region: c.region,
      }),
      source: 'feedback',
      classifiedBy: fb.classified_by ?? 'keyword_fallback',
      needsReview: result.primary.confidence < CLASSIFICATION.reviewThreshold,
      reviewedReasonId: review?.analyst_reason ?? null,
      reviewedBy: review ? ANALYST : null,
      reviewedAt: review ? parseStamp(review.reviewed_at) : null,
      createdAt: fb.classified_at ? parseStamp(fb.classified_at) : parseStamp(fb.replied_at),
    });
    classificationByCustomer.set(c.id, {
      id: classificationId,
      reasonId: result.primary.reasonId as ReasonId,
    });
  }

  /* -------- Pilot: approved recommendations → interventions → treated outcomes -------- */
  const interventionIdByRef = new Map<string, string>();
  for (const it of data.interventions) {
    const caseId = caseIdOf(it.case_id);
    const classification = classificationByCustomer.get(it.case_id);
    const reasonId = classification?.reasonId ?? 'unknown';
    const campaign = data.campaigns.find(
      (c) => c.action_id === it.action_id && c.reason === reasonId,
    );
    const recommendationId = randomUUID();
    const interventionId = randomUUID();
    interventionIdByRef.set(it.id, interventionId);

    rows.recommendations.push({
      id: recommendationId,
      caseId,
      classificationId: classification?.id ?? null,
      actionId: it.action_id,
      predictedRecovery: campaign?.recovery_rate ?? 0.2,
      rationale: 'Historical pilot record (synthetic): approved during the September 2026 pilot.',
      objective: ACTION_OBJECTIVES[it.action_id] ?? 'Recover bundle activity',
      eligibilityChecks: [],
      alternatives: [],
      status: 'approved',
      decidedBy: it.approved_by,
      decidedAt: parseStamp(it.approved_at),
      decisionNote: 'Approved during the September 2026 pilot (synthetic).',
      createdAt: parseStamp(it.drafted_at),
    });

    rows.interventions.push({
      id: interventionId,
      reference: it.id,
      recommendationId,
      caseId,
      actionId: it.action_id,
      channel: toChannel(it.channel),
      approvedBy: it.approved_by,
      approvedAt: parseStamp(it.approved_at),
      status: it.delivered ? 'delivered' : 'failed',
      handedOffAt: parseStamp(it.sent_at),
      deliveredAt: it.delivered ? parseStamp(it.sent_at) : null,
      clickRecorded: it.click_recorded,
      createdAt: parseStamp(it.drafted_at),
    });
  }

  for (const o of data.outcomes) {
    const customer = customerById.get(o.case_id);
    rows.outcomes.push({
      cohort: 'treated',
      caseId: caseIdOf(o.case_id),
      interventionId: interventionIdByRef.get(o.intervention_id) ?? null,
      windowDays: o.window_days,
      baselineActivations: o.baseline_activations,
      activationsAfter: o.activations_after,
      changePct: changeVsBaseline(o.activations_after, o.baseline_activations),
      outcomeType: outcomeType(
        o.recovered,
        o.activations_after,
        customer?.activations_per_month_now ?? 0,
      ),
      recovered: o.recovered,
      tolerancePct: 5,
      note: o.note,
      simulated: true,
      measuredAt: parseStamp(o.measured_at),
    });
  }

  /* --------------------------- Matched control cohort --------------------------- */
  for (const ctl of data.controls) {
    if (!ctl.matched_case_id) continue;
    const customer = customerById.get(ctl.matched_case_id);
    if (!customer) throw new Error(`Unknown control match ${ctl.matched_case_id}`);
    const baseline = customer.baseline_activations_per_month;
    const after = ctl.recovered ? Math.round(baseline * 0.95) : customer.activations_per_month_now;
    rows.outcomes.push({
      cohort: 'control',
      reference: ctl.id,
      caseId: caseIdOf(ctl.matched_case_id),
      interventionId: null,
      windowDays: ctl.window_days,
      baselineActivations: baseline,
      activationsAfter: after,
      changePct: changeVsBaseline(after, baseline),
      outcomeType: outcomeType(ctl.recovered, after, customer.activations_per_month_now),
      recovered: ctl.recovered,
      tolerancePct: ctl.tolerance_pct,
      note: 'Matched control (synthetic): no intervention.',
      simulated: true,
      measuredAt: new Date(RUN_DATE),
    });
  }

  return rows;
}
