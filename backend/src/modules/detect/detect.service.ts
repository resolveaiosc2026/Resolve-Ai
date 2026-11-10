/** Detect: priority queue, summary, segments and detection runs. */
import { DETECTION, PRIORITY } from '../../config/rules.js';
import { db, type Executor, type Transaction } from '../../db/client.js';
import { conflict, notFound } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import {
  detectCustomer,
  detectionWindows,
  toMetricRows,
  windowUsage,
  windowWeeks,
} from './detection.compute.js';
import * as repo from './detect.repository.js';
import type { CaseFilters, CaseRow, QueueStatus } from './detect.repository.js';
import type { PriorityBand } from './scoring.js';
import {
  toCustomerView,
  toPriorityView,
  toUsageView,
  type CaseMetrics,
  type QueueRow,
} from './view.js';

export type Paging = { page: number; pageSize: number };

const BANDS: { id: PriorityBand; label: string; minScore: number }[] = [
  { id: 'high', label: 'High risk', minScore: PRIORITY.bands.high },
  { id: 'medium', label: 'Medium risk', minScore: PRIORITY.bands.medium },
  { id: 'low', label: 'Low risk', minScore: 0 },
];

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

/* ------------------------------- Assembly ------------------------------- */

export type AssembledCase = { row: QueueRow; metrics: CaseMetrics; runId: string };

/** Builds QueueRows for case rows with a fixed number of batched queries (no N+1). */
export async function assembleCases(ex: Executor, rows: CaseRow[]): Promise<AssembledCase[]> {
  if (!rows.length) return [];
  const customerIds = rows.map((r) => r.customer.id);
  const caseIds = rows.map((r) => r.kase.id);
  const runIds = [...new Set(rows.map((r) => r.kase.runId))];

  const [metrics, weekly, classifications, runs, reasons] = await Promise.all([
    repo.findMetrics(ex, runIds, customerIds),
    repo.findWeeklyUsage(ex, customerIds),
    repo.findClassifications(ex, caseIds),
    repo.findRuns(ex, runIds),
    repo.findReasons(ex),
  ]);

  const runAt = new Map(runs.map((r) => [r.id, r.runAt]));
  const reasonLabel = new Map(reasons.map((r) => [r.id, r.label]));
  const latestReason = new Map<string, string>();
  for (const c of classifications) {
    if (!latestReason.has(c.caseId)) latestReason.set(c.caseId, c.reviewedReasonId ?? c.reasonId);
  }

  return rows.map(({ customer, kase }) => {
    const m: CaseMetrics = {
      baseline: metrics.find(
        (x) => x.customerId === customer.id && x.runId === kase.runId && x.period === 'baseline',
      ),
      current: metrics.find(
        (x) => x.customerId === customer.id && x.runId === kase.runId && x.period === 'current',
      ),
    };
    const weeks = windowWeeks(
      weekly
        .filter((w) => w.customerId === customer.id)
        .map((w) => ({ weekStart: w.weekStart, gb: w.dataGb })),
      runAt.get(kase.runId) ?? kase.flaggedAt,
    );
    const reasonId = latestReason.get(kase.id);
    return {
      metrics: m,
      runId: kase.runId,
      row: {
        caseId: kase.id,
        customer: toCustomerView(customer, kase, m),
        usage: toUsageView(weeks, windowUsage(weeks), m),
        priority: toPriorityView(kase),
        status: kase.queueStatus,
        reasonLabel: reasonId ? (reasonLabel.get(reasonId) ?? 'Not classified') : 'Awaiting reply',
      },
    };
  });
}

/* --------------------------------- Queue -------------------------------- */

export async function getQueue(filters: CaseFilters, paging: Paging) {
  const { rows, total } = await repo.findCaseRows(db, filters, {
    orderBy: 'priority',
    limit: paging.pageSize,
    offset: (paging.page - 1) * paging.pageSize,
  });
  const assembled = await assembleCases(db, rows);
  return { rows: assembled.map((a) => a.row), total };
}

export async function getCase(customerId: string): Promise<AssembledCase> {
  const row = await repo.findCaseRowByCustomer(db, customerId);
  if (!row) throw notFound(`No open case for customer ${customerId}`);
  const [assembled] = await assembleCases(db, [row]);
  if (!assembled) throw notFound(`No open case for customer ${customerId}`);
  return assembled;
}

/* -------------------------------- Summary ------------------------------- */

type BandCount = {
  key: PriorityBand;
  label: string;
  band: PriorityBand;
  count: number;
  pct: number;
};

function bandCounts(counts: Record<PriorityBand, number>, total: number): BandCount[] {
  return BANDS.map((b) => ({
    key: b.id,
    label: b.label,
    band: b.id,
    count: counts[b.id],
    pct: pct(counts[b.id], total),
  }));
}

async function pilotCounts() {
  const [byBand, byStatus] = await Promise.all([
    repo.countOpenCasesByBand(db),
    repo.countOpenCasesByStatus(db),
  ]);
  const bands: Record<PriorityBand, number> = { high: 0, medium: 0, low: 0 };
  for (const r of byBand) bands[r.band] = r.n;
  const statuses: Partial<Record<QueueStatus, number>> = {};
  for (const r of byStatus) statuses[r.status] = r.n;
  const total = byBand.reduce((s, r) => s + r.n, 0);
  return { total, bands, statuses };
}

/** Mirrors the frontend's `detectSummary()`; population figures are synthetic and labelled. */
export async function getSummary() {
  const [population, pilot, campaigns] = await Promise.all([
    repo.findLatestPopulationRun(db),
    pilotCounts(),
    repo.findCampaignHistory(db),
  ]);
  const n = campaigns.reduce((s, c) => s + c.n, 0);
  const historyRecoveryRate = n
    ? Math.round((campaigns.reduce((s, c) => s + c.rate * c.n, 0) / n) * 100)
    : 0;
  const pop = population?.populationSummary;

  return {
    runId: population?.id ?? null,
    flagged: pop?.flaggedTotal ?? pilot.total,
    subscribersScored: pop?.subscribersScored ?? pilot.total,
    awaitingReply: pop?.awaitingReply ?? pilot.statuses.awaiting_reply ?? 0,
    readyForAction: pop?.readyForAction ?? pilot.statuses.ready ?? 0,
    actionsAwaitingApproval: pop?.actionsAwaitingApproval ?? 0,
    minimumDaysInactive: pop?.minimumDaysInactive ?? 0,
    pilotSample: pop?.pilotSampleSize ?? pilot.total,
    historyRecoveryRate,
    bands: pop ? bandCounts(pop.riskBands, pop.flaggedTotal) : bandCounts(pilot.bands, pilot.total),
    simulated: Boolean(pop),
    pilot: {
      total: pilot.total,
      bands: bandCounts(pilot.bands, pilot.total),
      statuses: pilot.statuses,
    },
  };
}

/* ------------------------------- Segments ------------------------------- */

export async function getSegments() {
  const [pilot, population, bySegment] = await Promise.all([
    pilotCounts(),
    repo.findLatestPopulationRun(db),
    repo.segmentBreakdown(db),
  ]);
  const pop = population?.populationSummary;
  return {
    bands: BANDS.map((b) => ({
      id: b.id,
      label: b.label,
      minScore: b.minScore,
      count: pilot.bands[b.id],
      pct: pct(pilot.bands[b.id], pilot.total),
    })),
    population: pop
      ? {
          simulated: true,
          flagged: pop.flaggedTotal,
          bands: BANDS.map((b) => ({
            id: b.id,
            label: b.label,
            count: pop.riskBands[b.id],
            pct: pct(pop.riskBands[b.id], pop.flaggedTotal),
          })),
        }
      : null,
    bySegment: bySegment.map((s) => ({
      segment: s.segment,
      count: s.n,
      avgPriority: s.avgPriority,
    })),
  };
}

/* ---------------------------- Detection runs ---------------------------- */

export async function getLatestRun() {
  const run = await repo.findLatestRun(db);
  if (!run) throw notFound('No detection run yet');
  const counts = await repo.countRunContents(db, run.id);
  return {
    id: run.id,
    asOf: run.runAt.toISOString(),
    modelVersion: run.modelVersion,
    baselineWeeks: run.baselineWeeks,
    currentWeeks: run.currentWeeks,
    ...counts,
    hasSimulatedPopulation: run.populationSummary !== null,
  };
}

export type RunSummary = {
  id: string;
  asOf: string;
  modelVersion: string;
  customersScored: number;
  flagged: number;
  newCases: number;
  updatedCases: number;
  bands: Record<PriorityBand, number>;
};

/** Runs detection inside the given transaction (lets callers roll back, e.g. verification). */
export async function executeDetection(tx: Transaction, asOf: Date): Promise<RunSummary> {
  const signals = await repo.loadDetectionSignals(tx, detectionWindows(asOf));
  const detections = signals.map((s) => detectCustomer(s, asOf));
  const runId = await repo.nextRunId(tx, asOf);

  await repo.insertRun(tx, {
    id: runId,
    runAt: asOf,
    baselineWeeks: DETECTION.baselineWeeks,
    currentWeeks: DETECTION.currentWeeks,
    modelVersion: DETECTION.modelVersion,
    populationSummary: null,
    note: 'Detection re-run from stored behaviour (pilot sample only).',
  });
  await repo.insertMetrics(
    tx,
    detections.flatMap((d) => toMetricRows(runId, d)),
  );

  const open = await repo.findOpenCaseIds(tx);
  const bands: Record<PriorityBand, number> = { high: 0, medium: 0, low: 0 };
  let newCases = 0;
  let updatedCases = 0;
  for (const d of detections.filter((x) => x.flagged)) {
    bands[d.priority.band] += 1;
    const score = {
      runId,
      changePct: d.usage.changePct,
      priorityScore: d.priority.total,
      priorityBand: d.priority.band,
      contributions: d.priority.contributions,
      modelVersion: DETECTION.modelVersion,
    };
    const caseId = open.get(d.customerId);
    if (caseId) {
      await repo.updateCaseScore(tx, caseId, score);
      updatedCases += 1;
    } else {
      await repo.insertCase(tx, { ...score, customerId: d.customerId, flaggedAt: asOf });
      newCases += 1;
    }
  }

  return {
    id: runId,
    asOf: asOf.toISOString(),
    modelVersion: DETECTION.modelVersion,
    customersScored: detections.length,
    flagged: newCases + updatedCases,
    newCases,
    updatedCases,
    bands,
  };
}

function isUniqueViolation(err: unknown): boolean {
  const codeOf = (e: unknown) =>
    typeof e === 'object' && e !== null && 'code' in e ? (e as { code: unknown }).code : undefined;
  const cause = typeof err === 'object' && err !== null && 'cause' in err ? err.cause : undefined;
  return codeOf(err) === '23505' || codeOf(cause) === '23505';
}

/** Re-runs detection as of `asOf` (default: the latest run's date: the dataset snapshot). */
export async function runDetection(asOf?: Date): Promise<RunSummary> {
  const at = asOf ?? (await repo.findLatestRun(db))?.runAt ?? new Date();
  try {
    const summary = await db.transaction((tx) => executeDetection(tx, at));
    logger.info('Detection run complete', summary);
    return summary;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('Another detection run just started; try again');
    throw err;
  }
}
