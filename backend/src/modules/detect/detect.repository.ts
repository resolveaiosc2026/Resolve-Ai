/** Detect: Drizzle queries only (no business logic). */
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  like,
  lte,
  max,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';

import type { Executor } from '../../db/client.js';
import {
  bundleActivations,
  campaignHistory,
  cases,
  customerFeedback,
  customerMetrics,
  customerWeeklyUsage,
  customers,
  detectionRuns,
  networkFaults,
  reasonClassifications,
  reasons,
} from '../../db/schema/index.js';
import type { CustomerSignals, DetectionWindows } from './detection.compute.js';
import type { PriorityBand } from './scoring.js';

export type QueueStatus = (typeof cases.$inferSelect)['queueStatus'];

export type CaseFilters = {
  band?: PriorityBand;
  status?: QueueStatus;
  segment?: string;
  region?: string;
  search?: string;
};

export type CaseRow = {
  customer: typeof customers.$inferSelect;
  kase: typeof cases.$inferSelect;
};

function caseWhere(filters: CaseFilters): SQL | undefined {
  const conditions: SQL[] = [ne(cases.queueStatus, 'closed')];
  if (filters.band) conditions.push(eq(cases.priorityBand, filters.band));
  if (filters.status) conditions.push(eq(cases.queueStatus, filters.status));
  if (filters.segment) conditions.push(eq(customers.segment, filters.segment));
  if (filters.region) conditions.push(eq(customers.region, filters.region));
  // `search` is validated to letters, digits, spaces and hyphens, so no LIKE wildcards leak in.
  if (filters.search) conditions.push(ilike(customers.id, `%${filters.search}%`));
  return and(...conditions);
}

/* ------------------------------- View reads ------------------------------- */

export async function findCaseRows(
  ex: Executor,
  filters: CaseFilters,
  opts: { orderBy: 'priority' | 'customer'; limit: number; offset: number },
): Promise<{ rows: CaseRow[]; total: number }> {
  const where = caseWhere(filters);
  const order =
    opts.orderBy === 'priority'
      ? [desc(cases.priorityScore), asc(customers.id)]
      : [asc(customers.id)];
  const [rows, [totalRow]] = await Promise.all([
    ex
      .select({ customer: customers, kase: cases })
      .from(cases)
      .innerJoin(customers, eq(cases.customerId, customers.id))
      .where(where)
      .orderBy(...order)
      .limit(opts.limit)
      .offset(opts.offset),
    ex
      .select({ n: count() })
      .from(cases)
      .innerJoin(customers, eq(cases.customerId, customers.id))
      .where(where),
  ]);
  return { rows, total: totalRow?.n ?? 0 };
}

export async function findCaseRowByCustomer(
  ex: Executor,
  customerId: string,
): Promise<CaseRow | undefined> {
  const [row] = await ex
    .select({ customer: customers, kase: cases })
    .from(cases)
    .innerJoin(customers, eq(cases.customerId, customers.id))
    .where(and(eq(cases.customerId, customerId), ne(cases.queueStatus, 'closed')))
    .orderBy(desc(cases.flaggedAt))
    .limit(1);
  return row;
}

export function findMetrics(ex: Executor, runIds: string[], customerIds: string[]) {
  return ex
    .select()
    .from(customerMetrics)
    .where(
      and(inArray(customerMetrics.runId, runIds), inArray(customerMetrics.customerId, customerIds)),
    );
}

export function findWeeklyUsage(ex: Executor, customerIds: string[]) {
  return ex
    .select()
    .from(customerWeeklyUsage)
    .where(inArray(customerWeeklyUsage.customerId, customerIds));
}

/** Classifications for the cases, newest first (the service keeps the first per case). */
export function findClassifications(ex: Executor, caseIds: string[]) {
  return ex
    .select({
      caseId: reasonClassifications.caseId,
      reasonId: reasonClassifications.reasonId,
      reviewedReasonId: reasonClassifications.reviewedReasonId,
      createdAt: reasonClassifications.createdAt,
    })
    .from(reasonClassifications)
    .where(inArray(reasonClassifications.caseId, caseIds))
    .orderBy(desc(reasonClassifications.createdAt));
}

export function findRuns(ex: Executor, runIds: string[]) {
  return ex.select().from(detectionRuns).where(inArray(detectionRuns.id, runIds));
}

export function findReasons(ex: Executor) {
  return ex.select({ id: reasons.id, label: reasons.label }).from(reasons);
}

export async function findLatestRun(ex: Executor) {
  const [run] = await ex
    .select()
    .from(detectionRuns)
    .orderBy(desc(detectionRuns.runAt), desc(detectionRuns.id))
    .limit(1);
  return run;
}

export async function findLatestPopulationRun(ex: Executor) {
  const [run] = await ex
    .select()
    .from(detectionRuns)
    .where(isNotNull(detectionRuns.populationSummary))
    .orderBy(desc(detectionRuns.runAt), desc(detectionRuns.id))
    .limit(1);
  return run;
}

export function countOpenCasesByBand(ex: Executor) {
  return ex
    .select({ band: cases.priorityBand, n: count() })
    .from(cases)
    .where(ne(cases.queueStatus, 'closed'))
    .groupBy(cases.priorityBand);
}

export function countOpenCasesByStatus(ex: Executor) {
  return ex
    .select({ status: cases.queueStatus, n: count() })
    .from(cases)
    .where(ne(cases.queueStatus, 'closed'))
    .groupBy(cases.queueStatus);
}

export function segmentBreakdown(ex: Executor) {
  return ex
    .select({
      segment: customers.segment,
      n: count(),
      avgPriority: sql<number>`round(avg(${cases.priorityScore}), 1)::float`,
    })
    .from(cases)
    .innerJoin(customers, eq(cases.customerId, customers.id))
    .where(ne(cases.queueStatus, 'closed'))
    .groupBy(customers.segment)
    .orderBy(desc(count()), asc(customers.segment));
}

export function findCampaignHistory(ex: Executor) {
  return ex
    .select({ rate: campaignHistory.recoveryRate, n: campaignHistory.sampleSize })
    .from(campaignHistory);
}

export async function countRunContents(ex: Executor, runId: string) {
  const [[scored], [inRun]] = await Promise.all([
    ex
      .select({ n: count() })
      .from(customerMetrics)
      .where(and(eq(customerMetrics.runId, runId), eq(customerMetrics.period, 'current'))),
    ex.select({ n: count() }).from(cases).where(eq(cases.runId, runId)),
  ]);
  return { customersScored: scored?.n ?? 0, casesInRun: inRun?.n ?? 0 };
}

/* --------------------------- Detection run I/O ---------------------------- */

/** Everything detection needs, per customer, for the windows ending at `asOf`. */
export async function loadDetectionSignals(
  ex: Executor,
  w: DetectionWindows,
): Promise<CustomerSignals[]> {
  const asOfDay = w.asOf.toISOString().slice(0, 10);
  const [people, weekly, events, lastActivity, care, faults] = await Promise.all([
    ex
      .select({
        id: customers.id,
        segment: customers.segment,
        valueTier: customers.valueTier,
        tenureMonths: customers.tenureMonths,
      })
      .from(customers),
    ex.select().from(customerWeeklyUsage).where(lte(customerWeeklyUsage.weekStart, asOfDay)),
    ex
      .select({
        customerId: bundleActivations.customerId,
        activatedAt: bundleActivations.activatedAt,
        status: bundleActivations.status,
        pricePaid: bundleActivations.pricePaid,
        currency: bundleActivations.currency,
      })
      .from(bundleActivations)
      .where(
        and(
          gt(bundleActivations.activatedAt, w.baselineFrom),
          lte(bundleActivations.activatedAt, w.asOf),
        ),
      ),
    ex
      .select({ customerId: bundleActivations.customerId, at: max(bundleActivations.activatedAt) })
      .from(bundleActivations)
      .where(
        and(eq(bundleActivations.status, 'success'), lte(bundleActivations.activatedAt, w.asOf)),
      )
      .groupBy(bundleActivations.customerId),
    ex
      .select({ customerId: customerFeedback.customerId, at: customerFeedback.receivedAt })
      .from(customerFeedback)
      .where(
        and(
          eq(customerFeedback.channel, 'customer_service'),
          isNotNull(customerFeedback.customerId),
          gt(customerFeedback.receivedAt, w.signalFrom),
          lte(customerFeedback.receivedAt, w.asOf),
        ),
      ),
    ex
      .select({ customerId: networkFaults.customerId, at: networkFaults.reportedAt })
      .from(networkFaults)
      .where(
        and(
          isNotNull(networkFaults.customerId),
          gt(networkFaults.reportedAt, w.signalFrom),
          lte(networkFaults.reportedAt, w.asOf),
        ),
      ),
  ]);

  const group = <T extends { customerId: string | null }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) {
      if (!r.customerId) continue;
      const list = map.get(r.customerId) ?? [];
      list.push(r);
      map.set(r.customerId, list);
    }
    return map;
  };
  const weeklyBy = group(weekly);
  const eventsBy = group(events);
  const careBy = group(care);
  const faultsBy = group(faults);
  const lastBy = new Map(lastActivity.map((r) => [r.customerId, r.at]));

  return people.map((p) => ({
    customerId: p.id,
    segment: p.segment,
    valueTier: p.valueTier,
    tenureMonths: p.tenureMonths,
    weekly: (weeklyBy.get(p.id) ?? []).map((u) => ({ weekStart: u.weekStart, gb: u.dataGb })),
    events: (eventsBy.get(p.id) ?? []).map((e) => ({
      activatedAt: e.activatedAt,
      status: e.status,
      pricePaid: e.pricePaid,
      currency: e.currency,
    })),
    lastActivityAt: lastBy.get(p.id) ?? null,
    careContactTimes: (careBy.get(p.id) ?? []).map((c) => c.at),
    faultReportTimes: (faultsBy.get(p.id) ?? []).map((f) => f.at),
  }));
}

/** Open (not closed) case id per customer. */
export async function findOpenCaseIds(ex: Executor): Promise<Map<string, string>> {
  const rows = await ex
    .select({ id: cases.id, customerId: cases.customerId })
    .from(cases)
    .where(ne(cases.queueStatus, 'closed'))
    .orderBy(asc(cases.flaggedAt));
  return new Map(rows.map((r) => [r.customerId, r.id]));
}

/** Next run id for the date: RUN-2026-10-28-01, -02, ... */
export async function nextRunId(ex: Executor, asOf: Date): Promise<string> {
  const prefix = `RUN-${asOf.toISOString().slice(0, 10)}-`;
  const [row] = await ex
    .select({ n: count() })
    .from(detectionRuns)
    .where(like(detectionRuns.id, `${prefix}%`));
  return `${prefix}${String((row?.n ?? 0) + 1).padStart(2, '0')}`;
}

export async function insertRun(ex: Executor, run: typeof detectionRuns.$inferInsert) {
  await ex.insert(detectionRuns).values(run);
}

export async function insertMetrics(ex: Executor, rows: (typeof customerMetrics.$inferInsert)[]) {
  if (rows.length) await ex.insert(customerMetrics).values(rows);
}

export async function updateCaseScore(
  ex: Executor,
  caseId: string,
  values: Pick<
    typeof cases.$inferInsert,
    'runId' | 'changePct' | 'priorityScore' | 'priorityBand' | 'contributions' | 'modelVersion'
  >,
) {
  await ex.update(cases).set(values).where(eq(cases.id, caseId));
}

export async function insertCase(ex: Executor, row: typeof cases.$inferInsert) {
  await ex.insert(cases).values(row);
}
