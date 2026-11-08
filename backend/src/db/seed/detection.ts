/**
 * Detection rows for the historical run: the run itself, per-customer metrics
 * (baseline + current) and one case per customer, all computed with the shared
 * Detect scoring module from the generated behaviour.
 */
import { randomUUID } from 'node:crypto';

import { DETECTION } from '../../config/rules.js';
import {
  scorePriority,
  summarizeActivations,
  summarizeUsage,
  type UsageSummary,
} from '../../modules/detect/scoring.js';
import type { cases, customerMetrics, detectionRuns } from '../schema/index.js';
import type { CustomerBehaviour } from './behaviour.js';
import { DAY_MS, RUN_DATE, parseStamp, type PilotDataset } from './pilot-dataset.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export type DetectionRows = {
  run: Row<typeof detectionRuns>;
  metrics: Row<typeof customerMetrics>[];
  cases: Row<typeof cases>[];
  caseIdByCustomer: Map<string, string>;
  usageByCustomer: Map<string, UsageSummary>;
};

export function buildDetection(
  data: PilotDataset,
  behaviour: Map<string, CustomerBehaviour>,
): DetectionRows {
  const r = data.run;
  const runId = r.run_id;
  const runAt = new Date(RUN_DATE);
  const rows: DetectionRows = {
    run: {
      id: runId,
      runAt: parseStamp(r.run_at),
      baselineWeeks: DETECTION.baselineWeeks,
      currentWeeks: DETECTION.currentWeeks,
      modelVersion: DETECTION.modelVersion,
      populationSummary: {
        windowDays: r.window_days,
        subscribersScored: r.subscribers_scored,
        flaggedTotal: r.flagged_total,
        riskBands: r.risk_bands,
        awaitingReply: r.awaiting_reply,
        readyForAction: r.ready_for_action,
        actionsAwaitingApproval: r.actions_awaiting_approval,
        minimumDaysInactive: r.minimum_days_inactive,
        pilotSampleSize: r.pilot_sample_size,
        pilotWindowDays: r.pilot_window_days,
        churnedCustomerIds: r.churned_case_ids,
        marginImpactChangePct: r.margin_impact_change_pct,
        approvalsThisWeek: r.approvals_this_week,
        simulated: true,
      },
      note: r.note,
    },
    metrics: [],
    cases: [],
    caseIdByCustomer: new Map(),
    usageByCustomer: new Map(),
  };

  const currentFrom = new Date(RUN_DATE - DETECTION.activationCurrentDays * DAY_MS);
  const baselineFrom = new Date(currentFrom.getTime() - DETECTION.activationBaselineDays * DAY_MS);
  const baselineMonths = DETECTION.activationBaselineDays / DETECTION.activationCurrentDays;

  for (const c of data.customers) {
    const b = behaviour.get(c.id);
    if (!b) throw new Error(`No behaviour for ${c.id}`);

    const usage = summarizeUsage(b.weeklyGb);
    const baseline = summarizeActivations(b.events, {
      from: baselineFrom,
      to: currentFrom,
      months: baselineMonths,
    });
    const current = summarizeActivations(b.events, { from: currentFrom, to: runAt, months: 1 });
    const careContacts30d = b.careContactTimes.length;
    const networkFaultReports30d = b.faultReportTimes.length;

    rows.metrics.push(
      {
        runId,
        customerId: c.id,
        period: 'baseline',
        activations: baseline.activations,
        dataGb: usage.baselineGb,
        spendUsd: baseline.spendUsd,
        spendLrd: baseline.spendLrd,
        spendUsdEquivalent: baseline.spendUsdEquivalent,
        activeDays: baseline.activeDays,
        failedActivationRate: baseline.failedActivationRate,
        daysSinceLastActivity: baseline.daysSinceLastActivity,
        careContacts30d: 0,
        networkFaultReports30d: 0,
      },
      {
        runId,
        customerId: c.id,
        period: 'current',
        activations: current.activations,
        dataGb: usage.currentGb,
        spendUsd: current.spendUsd,
        spendLrd: current.spendLrd,
        spendUsdEquivalent: current.spendUsdEquivalent,
        activeDays: current.activeDays,
        failedActivationRate: current.failedActivationRate,
        daysSinceLastActivity: current.daysSinceLastActivity,
        careContacts30d,
        networkFaultReports30d,
      },
    );

    const priority = scorePriority(
      {
        segment: c.segment,
        valueTier: c.value_tier.toLowerCase() as 'high' | 'medium' | 'low',
        tenureMonths: c.tenure_months,
        daysSinceLastActivity: current.daysSinceLastActivity,
        careContacts30d,
      },
      usage,
    );

    const caseId = randomUUID();
    rows.caseIdByCustomer.set(c.id, caseId);
    rows.usageByCustomer.set(c.id, usage);
    rows.cases.push({
      id: caseId,
      customerId: c.id,
      runId,
      flaggedAt: parseStamp(c.flagged_at),
      changePct: usage.changePct,
      priorityScore: priority.total,
      priorityBand: priority.band,
      contributions: priority.contributions,
      modelVersion: DETECTION.modelVersion,
      queueStatus: c.queue_status,
    });
  }

  return rows;
}
