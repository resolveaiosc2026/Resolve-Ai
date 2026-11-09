/** Report: summary (ported reportView), drivers, actions, trends. */
import { DETECTION } from '../../config/rules.js';
import { db, type Executor } from '../../db/client.js';
import { cohortStats, reasonDistribution } from './report.compute.js';
import * as repo from './report.repository.js';

const DAY_MS = 86_400_000;

/** Latest classification per case (newest first in the query). */
function latestByCase<T extends { caseId: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const r of rows) if (!map.has(r.caseId)) map.set(r.caseId, r);
  return map;
}

/** Mirrors the prototype's reportView(). */
export async function summaryWith(ex: Executor) {
  const [
    openCases,
    classifications,
    reasonRows,
    population,
    allOutcomes,
    allInterventions,
    campaigns,
  ] = await Promise.all([
    repo.findOpenCases(ex),
    repo.findAllClassifications(ex),
    repo.findReasons(ex),
    repo.findPopulationRun(ex),
    repo.findOutcomes(ex),
    repo.findInterventions(ex),
    repo.findCampaignsWithNames(ex),
  ]);
  const label = new Map(reasonRows.map((r) => [r.id, r.label]));
  const latest = latestByCase(classifications);
  const pop = population?.populationSummary;

  // Reasons over classified cases; the rest are reported as "awaiting reply".
  const classifiedLabels: string[] = [];
  let awaitingReply = 0;
  for (const c of openCases) {
    const cls = latest.get(c.id);
    if (!cls) awaitingReply++;
    else classifiedLabels.push(label.get(cls.reasonId) ?? 'Not classified');
  }

  const treated = allOutcomes.filter((o) => o.cohort === 'treated');
  const control = allOutcomes.filter((o) => o.cohort === 'control');
  const t = cohortStats(treated.filter((o) => o.recovered).length, treated.length);
  const k = cohortStats(control.filter((o) => o.recovered).length, control.length);

  // Human/AI agreement: classifications from customer replies that a human reviewed.
  const reviewed = classifications.filter((c) => c.source === 'feedback' && c.reviewedBy);
  const replyTexts = new Map(
    (
      await repo.findFeedbackByIds(
        ex,
        reviewed.flatMap((r) => (r.feedbackId ? [r.feedbackId] : [])),
      )
    ).map((f) => [f.id, f.rawText]),
  );
  const caseCustomer = new Map(openCases.map((c) => [c.id, c.customerId]));
  const agreed = reviewed.filter((r) => r.reviewedReasonId === r.reasonId).length;
  const flagged = pop?.pilotSampleSize ?? openCases.length;
  const churned = pop?.churnedCustomerIds.length ?? 0;

  return {
    flagged,
    windowDays: pop?.pilotWindowDays ?? 0,
    churned,
    churnPct: flagged ? Math.round((churned / flagged) * 1000) / 10 : 0,
    approvalsThisWeek: pop?.approvalsThisWeek ?? 0,
    approvalsTotal: allInterventions.length,
    marginImpactPct: pop?.marginImpactChangePct ?? 0,
    awaitingReply,
    classified: classifiedLabels.length,
    reasons: reasonDistribution(classifiedLabels),
    treated: t,
    control: k,
    differencePoints: Math.round((t.rate - k.rate) * 100),
    intervalsOverlap: t.ci.low <= k.ci.high && k.ci.low <= t.ci.high,
    agreement: {
      agreed,
      reviewed: reviewed.length,
      pct: reviewed.length ? Math.round((agreed / reviewed.length) * 100) : 0,
      rows: reviewed
        .map((r) => ({
          customerId: caseCustomer.get(r.caseId) ?? null,
          verbatim: r.feedbackId ? (replyTexts.get(r.feedbackId) ?? null) : null,
          aiReason: r.reasonId,
          aiConfidence: r.confidence,
          analystReason: r.reviewedReasonId,
          agreed: r.reviewedReasonId === r.reasonId,
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
        }))
        .sort((a, b) => (a.reviewedAt ?? '').localeCompare(b.reviewedAt ?? '')),
    },
    history: campaigns.map((c) => ({
      reason: label.get(c.reasonId) ?? 'Not classified',
      action: c.actionName,
      outcome: `${Math.round(c.rate * 100)}% (n=${c.n})`,
    })),
    simulated: true,
  };
}

export const getSummary = () => summaryWith(db);

/** Disengagement drivers: reasons by source, and feedback coverage. */
export async function getDrivers() {
  const [openCases, classifications, reasonRows, requests] = await Promise.all([
    repo.findOpenCases(db),
    repo.findAllClassifications(db),
    repo.findReasons(db),
    repo.findRequests(db),
  ]);
  const latest = latestByCase(classifications);
  const openIds = new Set(openCases.map((c) => c.id));
  const classified = [...latest.values()].filter((c) => openIds.has(c.caseId));
  const asked = new Set(requests.filter((r) => openIds.has(r.caseId)).map((r) => r.caseId));
  const answered = new Set(
    requests.filter((r) => openIds.has(r.caseId) && r.status === 'responded').map((r) => r.caseId),
  );

  return {
    reasons: reasonRows.map((r) => {
      const rows = classified.filter((c) => c.reasonId === r.id);
      return {
        id: r.id,
        label: r.label,
        count: rows.length,
        pct: classified.length ? Math.round((rows.length / classified.length) * 100) : 0,
        bySource: {
          feedback: rows.filter((c) => c.source === 'feedback').length,
          evidence: rows.filter((c) => c.source === 'evidence').length,
          human: rows.filter((c) => c.source === 'human').length,
        },
      };
    }),
    coverage: {
      openCases: openCases.length,
      classified: classified.length,
      unknown: classified.filter((c) => c.reasonId === 'unknown').length,
      needsReview: classified.filter((c) => c.needsReview).length,
      asked: asked.size,
      answered: answered.size,
      unanswered: asked.size - answered.size,
      noReasonYet: openCases.length - classified.length,
    },
  };
}

/** Action effectiveness: the funnel per action, plus campaign history. */
export async function getActionsReport() {
  const [actionRows, recs, ints, outs, campaigns] = await Promise.all([
    repo.findActions(db),
    repo.findRecommendations(db),
    repo.findInterventions(db),
    repo.findOutcomes(db),
    repo.findCampaignsWithNames(db),
  ]);
  const recById = new Map(recs.map((r) => [r.id, r]));
  return {
    actions: actionRows.map((a) => {
      const mine = ints.filter((i) => i.actionId === a.id);
      const measured = outs.filter((o) => mine.some((i) => i.id === o.interventionId));
      return {
        id: a.id,
        name: a.name,
        recommended: recs.filter((r) => r.actionId === a.id).length,
        approved: mine.filter((i) => recById.get(i.recommendationId)?.actionId === a.id).length,
        changedTo: mine.filter((i) => recById.get(i.recommendationId)?.actionId !== a.id).length,
        rejected: recs.filter((r) => r.actionId === a.id && r.status === 'rejected').length,
        delivered: mine.filter((i) => i.status === 'delivered').length,
        measured: measured.length,
        recovered: measured.filter((o) => o.recovered).length,
      };
    }),
    campaignHistory: campaigns.map((c) => ({
      reasonId: c.reasonId,
      actionId: c.actionId,
      action: c.actionName,
      recoveryRate: c.rate,
      n: c.n,
      simulated: true,
    })),
  };
}

/** Average weekly GB across open cases for the detection window (baseline vs current weeks). */
export async function getTrends() {
  const asOf = await repo.findLatestRunAt(db);
  const rows = await repo.findWeeklyUsageForOpenCases(db, asOf.toISOString().slice(0, 10));
  const byWeek = new Map<string, number[]>();
  for (const r of rows) byWeek.set(r.weekStart, [...(byWeek.get(r.weekStart) ?? []), r.gb]);
  const weeks = [...byWeek.keys()]
    .sort()
    .slice(-(DETECTION.baselineWeeks + DETECTION.currentWeeks));
  return {
    asOf: asOf.toISOString(),
    since: new Date(asOf.getTime() - weeks.length * 7 * DAY_MS).toISOString().slice(0, 10),
    weeks: weeks.map((weekStart, i) => {
      const values = byWeek.get(weekStart) ?? [];
      return {
        weekStart,
        period: i < weeks.length - DETECTION.currentWeeks ? 'baseline' : 'current',
        customers: values.length,
        avgGb: values.length
          ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
          : 0,
      };
    }),
  };
}
