/** Copilot step 2: load facts from the backend's own services and aggregates (no model). */
import { CLASSIFICATION } from '../../config/rules.js';
import { db } from '../../db/client.js';
import * as detectRepo from '../detect/detect.repository.js';
import { getCase, getSummary } from '../detect/detect.service.js';
import * as recommendRepo from '../recommend/recommend.repository.js';
import { actionLibrary, recommendationViewWith } from '../recommend/recommend.service.js';
import * as reportRepo from '../report/report.repository.js';
import { summaryWith } from '../report/report.service.js';
import * as understandRepo from '../understand/understand.repository.js';
import {
  composeAction,
  composeApprovals,
  composeCustomer,
  composePilot,
  composePopulation,
  composeReasons,
  composeSegment,
  composeTrust,
  composeUnknown,
  rankSegments,
  type Composed,
} from './copilot.compose.js';
import type { ActionReason } from './copilot.intents.js';

const ALL = { limit: 10_000, offset: 0 } as const;

export async function customerExists(customerId: string): Promise<boolean> {
  return Boolean(await detectRepo.findCaseRowByCustomer(db, customerId));
}

/** Latest classification per open case. */
async function latestReasons() {
  const [open, classifications] = await Promise.all([
    reportRepo.findOpenCases(db),
    reportRepo.findAllClassifications(db),
  ]);
  const openIds = new Set(open.map((c) => c.id));
  const latest = new Map<string, (typeof classifications)[number]>();
  for (const c of classifications) {
    if (openIds.has(c.caseId) && !latest.has(c.caseId)) latest.set(c.caseId, c);
  }
  return { open, latest };
}

export async function customerAnswer(customerId: string | null): Promise<Composed> {
  let id = customerId;
  if (!id) {
    const { rows } = await detectRepo.findCaseRows(
      db,
      {},
      { orderBy: 'priority', limit: 1, offset: 0 },
    );
    id = rows[0]?.customer.id ?? null;
  }
  if (!id) return composeUnknown(0);

  const { row } = await getCase(id);
  const [classifications, reasons, rec, sent] = await Promise.all([
    understandRepo.findClassifications(db, [row.caseId]),
    understandRepo.findReasons(db),
    recommendationViewWith(db, id),
    recommendRepo.findCustomerInterventions(db, id),
  ]);
  const cls = classifications[0];
  const sentDates = sent
    .map((s) => (s.handedOffAt ?? s.createdAt).toISOString().slice(0, 10))
    .sort();
  const topDriver = [...row.priority.contributions].sort((a, b) => b.points - a.points)[0];

  return composeCustomer({
    id,
    segment: row.customer.segment,
    region: row.customer.region,
    tenureMonths: row.customer.tenureMonths,
    baselineGb: row.usage.baselineGb,
    currentGb: row.usage.currentGb,
    changePct: row.usage.changePct,
    priority: row.priority.total,
    band: row.priority.band,
    topDriver: topDriver?.label ?? '—',
    reason: cls
      ? {
          label: reasons.find((r) => r.id === cls.reasonId)?.label ?? cls.reasonId,
          confidence: cls.confidence,
        }
      : null,
    suggestedAction: cls ? (rec.recommended?.action.name ?? null) : null,
    sent: sentDates[0] ? { count: sentDates.length, firstDate: sentDates[0] } : null,
  });
}

export async function pilotAnswer(): Promise<Composed> {
  const r = await summaryWith(db);
  return composePilot({
    treated: r.treated,
    control: r.control,
    differencePoints: r.differencePoints,
    intervalsOverlap: r.intervalsOverlap,
    windowDays: r.windowDays,
  });
}

export async function populationAnswer(): Promise<Composed> {
  const [s, r] = await Promise.all([getSummary(), summaryWith(db)]);
  return composePopulation({
    runId: s.runId ?? '—',
    flagged: s.flagged,
    scored: s.subscribersScored,
    highRisk: s.bands.find((b) => b.key === 'high')?.count ?? 0,
    awaitingReply: s.awaitingReply,
    readyForAction: s.readyForAction,
    pilotSample: r.flagged,
  });
}

export async function segmentAnswer(): Promise<Composed> {
  const [{ rows }, r] = await Promise.all([
    detectRepo.findCaseRows(db, {}, { orderBy: 'priority', ...ALL }),
    summaryWith(db),
  ]);
  const ranked = rankSegments(
    rows.map((x) => ({
      segment: x.customer.segment,
      priority: x.kase.priorityScore,
      band: x.kase.priorityBand,
    })),
  );
  return composeSegment(ranked, r.flagged);
}

export async function reasonsAnswer(): Promise<Composed> {
  const r = await summaryWith(db);
  return composeReasons({
    classified: r.classified,
    awaitingReply: r.awaitingReply,
    reasons: r.reasons,
  });
}

export async function actionAnswer(reason: ActionReason): Promise<Composed> {
  const [reasons, campaigns, library, { open, latest }] = await Promise.all([
    understandRepo.findReasons(db),
    recommendRepo.findCampaigns(db),
    actionLibrary(db),
    latestReasons(),
  ]);
  const options = campaigns
    .filter((c) => c.reasonId === reason)
    .sort((a, b) => b.recoveryRate - a.recoveryRate)
    .map((c) => {
      const action = library.find((a) => a.id === c.actionId);
      return {
        shortName: action?.shortName ?? c.actionId,
        name: action?.name ?? c.actionId,
        rate: c.recoveryRate,
        n: c.sampleSize,
      };
    });
  // Run the engine only for cases that carry this reason (a handful, not the whole queue).
  const withReason = open.filter((c) => latest.get(c.id)?.reasonId === reason);
  const views = await Promise.all(withReason.map((c) => recommendationViewWith(db, c.customerId)));
  return composeAction({
    reasonLabel: reasons.find((r) => r.id === reason)?.label ?? 'Affordability',
    options,
    eligibleCount: views.filter((v) => v.recommended !== null).length,
  });
}

export async function approvalsAnswer(): Promise<Composed> {
  const [s, byStatus, interventions, r] = await Promise.all([
    getSummary(),
    detectRepo.countOpenCasesByStatus(db),
    reportRepo.findInterventions(db),
    summaryWith(db),
  ]);
  return composeApprovals({
    awaitingApproval: s.actionsAwaitingApproval,
    newInQueue: byStatus.find((x) => x.status === 'new')?.n ?? 0,
    pilotSample: r.flagged,
    executed: interventions.length,
  });
}

export async function trustAnswer(): Promise<Composed> {
  const [r, { latest }] = await Promise.all([summaryWith(db), latestReasons()]);
  return composeTrust({
    reviewed: r.agreement.reviewed,
    agreed: r.agreement.agreed,
    pct: r.agreement.pct,
    belowGate: [...latest.values()].filter((c) => c.confidence < CLASSIFICATION.recommendationGate)
      .length,
  });
}

export async function unknownAnswer(): Promise<Composed> {
  return composeUnknown((await summaryWith(db)).flagged);
}
