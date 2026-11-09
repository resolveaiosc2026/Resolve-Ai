/** Act: Drizzle queries only. */
import { and, asc, count, desc, eq, like, type SQL } from 'drizzle-orm';

import type { Executor } from '../../db/client.js';
import {
  actions,
  cases,
  customers,
  interventions,
  outcomes,
  recommendations,
} from '../../db/schema/index.js';

export type InterventionStatus = (typeof interventions.$inferSelect)['status'];

export async function lockRecommendation(ex: Executor, id: string) {
  const [row] = await ex
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, id))
    .for('update');
  return row;
}

export async function decideRecommendation(
  ex: Executor,
  id: string,
  values: Pick<
    typeof recommendations.$inferInsert,
    'status' | 'decidedBy' | 'decidedAt' | 'decisionNote'
  >,
) {
  await ex.update(recommendations).set(values).where(eq(recommendations.id, id));
}

/** Next readable reference: INT-4106 after INT-4105. */
export async function nextInterventionReference(ex: Executor): Promise<string> {
  const rows = await ex
    .select({ reference: interventions.reference })
    .from(interventions)
    .where(like(interventions.reference, 'INT-%'));
  const max = rows.reduce((m, r) => Math.max(m, Number(r.reference.slice(4)) || 0), 4099);
  return `INT-${max + 1}`;
}

export async function insertIntervention(ex: Executor, row: typeof interventions.$inferInsert) {
  const [created] = await ex.insert(interventions).values(row).returning();
  return created;
}

export function findAction(ex: Executor, actionId: string) {
  return ex.select().from(actions).where(eq(actions.id, actionId)).limit(1);
}

const interventionSelect = {
  intervention: interventions,
  kase: cases,
  customer: customers,
  action: actions,
  recommendation: recommendations,
};

/** By uuid or readable reference (INT-4100). */
export async function findIntervention(ex: Executor, idOrReference: string) {
  const byRef = idOrReference.startsWith('INT-');
  const [row] = await ex
    .select(interventionSelect)
    .from(interventions)
    .innerJoin(cases, eq(interventions.caseId, cases.id))
    .innerJoin(customers, eq(cases.customerId, customers.id))
    .innerJoin(actions, eq(interventions.actionId, actions.id))
    .innerJoin(recommendations, eq(interventions.recommendationId, recommendations.id))
    .where(byRef ? eq(interventions.reference, idOrReference) : eq(interventions.id, idOrReference))
    .limit(1);
  return row;
}

export async function listInterventions(
  ex: Executor,
  filters: { status?: InterventionStatus },
  paging: { limit: number; offset: number },
) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(interventions.status, filters.status));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    ex
      .select(interventionSelect)
      .from(interventions)
      .innerJoin(cases, eq(interventions.caseId, cases.id))
      .innerJoin(customers, eq(cases.customerId, customers.id))
      .innerJoin(actions, eq(interventions.actionId, actions.id))
      .innerJoin(recommendations, eq(interventions.recommendationId, recommendations.id))
      .where(where)
      .orderBy(desc(interventions.approvedAt), asc(interventions.reference))
      .limit(paging.limit)
      .offset(paging.offset),
    ex.select({ n: count() }).from(interventions).where(where),
  ]);
  return { rows, total: totalRow?.n ?? 0 };
}

export function findOutcomeForIntervention(ex: Executor, interventionId: string) {
  return ex.select().from(outcomes).where(eq(outcomes.interventionId, interventionId)).limit(1);
}
