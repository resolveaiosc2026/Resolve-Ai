/**
 * Detection rows for the historical run: the run itself, per-customer metrics
 * (baseline + current) and one case per customer. Computed with the SAME
 * `detectCustomer` the live detection service uses, so seed and API never drift.
 */
import { randomUUID } from 'node:crypto';

import { DETECTION } from '../../config/rules.js';
import { detectCustomer, toMetricRows } from '../../modules/detect/detection.compute.js';
import type { UsageSummary } from '../../modules/detect/scoring.js';
import type { cases, customerMetrics, detectionRuns } from '../schema/index.js';
import type { CustomerBehaviour } from './behaviour.js';
import { RUN_DATE, parseStamp, type PilotDataset } from './pilot-dataset.js';

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
  const asOf = new Date(RUN_DATE);
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

  for (const c of data.customers) {
    const b = behaviour.get(c.id);
    const activity = data.activity[c.id];
    if (!b || !activity) throw new Error(`No behaviour for ${c.id}`);

    const lastActivityAt = b.events
      .filter((e) => e.status === 'success' && e.activatedAt <= asOf)
      .reduce<Date | null>(
        (last, e) => (!last || e.activatedAt > last ? e.activatedAt : last),
        null,
      );

    const d = detectCustomer(
      {
        customerId: c.id,
        segment: c.segment,
        valueTier: c.value_tier.toLowerCase() as 'high' | 'medium' | 'low',
        tenureMonths: c.tenure_months,
        weekly: activity.weeks.map((w) => ({ weekStart: w.week_start, gb: w.gb })),
        events: b.events,
        lastActivityAt,
        careContactTimes: b.careContactTimes,
        faultReportTimes: b.faultReportTimes,
      },
      asOf,
    );

    rows.metrics.push(...toMetricRows(runId, d));

    const caseId = randomUUID();
    rows.caseIdByCustomer.set(c.id, caseId);
    rows.usageByCustomer.set(c.id, d.usage);
    rows.cases.push({
      id: caseId,
      customerId: c.id,
      runId,
      flaggedAt: parseStamp(c.flagged_at),
      changePct: d.usage.changePct,
      priorityScore: d.priority.total,
      priorityBand: d.priority.band,
      contributions: d.priority.contributions,
      modelVersion: DETECTION.modelVersion,
      queueStatus: c.queue_status,
    });
  }

  return rows;
}
