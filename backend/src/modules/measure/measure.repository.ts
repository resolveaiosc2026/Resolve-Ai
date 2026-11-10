/** Measure: Drizzle queries only. */
import { and, desc, eq, gt, lte } from 'drizzle-orm';

import type { Executor } from '../../db/client.js';
import {
  bundleActivations,
  bundles,
  customerMetrics,
  interventions,
  outcomes,
  recommendations,
} from '../../db/schema/index.js';

export async function findBundle(ex: Executor, id: string) {
  const [row] = await ex.select().from(bundles).where(eq(bundles.id, id)).limit(1);
  return row;
}

export async function insertActivations(
  ex: Executor,
  rows: (typeof bundleActivations.$inferInsert)[],
) {
  if (rows.length) await ex.insert(bundleActivations).values(rows);
}

export async function updateIntervention(
  ex: Executor,
  id: string,
  values: Partial<typeof interventions.$inferInsert>,
) {
  await ex.update(interventions).set(values).where(eq(interventions.id, id));
}

export function findPurchases(ex: Executor, customerId: string, from: Date, to: Date) {
  return ex
    .select({
      activatedAt: bundleActivations.activatedAt,
      status: bundleActivations.status,
      pricePaid: bundleActivations.pricePaid,
      currency: bundleActivations.currency,
      dataMb: bundleActivations.dataMb,
    })
    .from(bundleActivations)
    .where(
      and(
        eq(bundleActivations.customerId, customerId),
        gt(bundleActivations.activatedAt, from),
        lte(bundleActivations.activatedAt, to),
      ),
    );
}

export async function insertOutcome(ex: Executor, row: typeof outcomes.$inferInsert) {
  const [created] = await ex.insert(outcomes).values(row).returning();
  return created;
}

export async function upsertMetric(ex: Executor, row: typeof customerMetrics.$inferInsert) {
  await ex
    .insert(customerMetrics)
    .values(row)
    .onConflictDoUpdate({
      target: [customerMetrics.runId, customerMetrics.customerId, customerMetrics.period],
      set: { ...row },
    });
}

/** Latest intervention for the case with its recommendation. */
export async function findLatestIntervention(ex: Executor, caseId: string) {
  const [row] = await ex
    .select({ intervention: interventions, recommendation: recommendations })
    .from(interventions)
    .innerJoin(recommendations, eq(interventions.recommendationId, recommendations.id))
    .where(eq(interventions.caseId, caseId))
    .orderBy(desc(interventions.createdAt))
    .limit(1);
  return row;
}

export async function findOutcome(ex: Executor, interventionId: string) {
  const [row] = await ex
    .select()
    .from(outcomes)
    .where(eq(outcomes.interventionId, interventionId))
    .limit(1);
  return row;
}

export function findControls(ex: Executor) {
  return ex.select().from(outcomes).where(eq(outcomes.cohort, 'control'));
}
