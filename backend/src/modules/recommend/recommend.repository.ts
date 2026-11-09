/** Recommend: Drizzle queries only. */
import { and, asc, count, desc, eq, inArray, type SQL } from 'drizzle-orm';

import type { Executor } from '../../db/client.js';
import {
  actionReasons,
  actions,
  campaignHistory,
  cases,
  customers,
  interventions,
  recommendations,
} from '../../db/schema/index.js';

export type RecommendationStatus = (typeof recommendations.$inferSelect)['status'];

export async function findActionLibrary(ex: Executor) {
  const [rows, links] = await Promise.all([
    ex.select().from(actions).orderBy(asc(actions.sortOrder), asc(actions.id)),
    ex.select().from(actionReasons),
  ]);
  return rows.map((a) => ({
    ...a,
    reasons: links.filter((l) => l.actionId === a.id).map((l) => l.reasonId),
  }));
}

export function findCampaigns(ex: Executor) {
  return ex.select().from(campaignHistory).orderBy(asc(campaignHistory.id));
}

/** Hand-off times of every intervention for the customer (any case). */
export function findCustomerInterventions(ex: Executor, customerId: string) {
  return ex
    .select({ handedOffAt: interventions.handedOffAt, createdAt: interventions.createdAt })
    .from(interventions)
    .innerJoin(cases, eq(interventions.caseId, cases.id))
    .where(eq(cases.customerId, customerId));
}

export function findCaseRecommendations(ex: Executor, caseId: string) {
  return ex
    .select()
    .from(recommendations)
    .where(eq(recommendations.caseId, caseId))
    .orderBy(desc(recommendations.createdAt));
}

export async function insertRecommendation(ex: Executor, row: typeof recommendations.$inferInsert) {
  const [created] = await ex.insert(recommendations).values(row).returning();
  return created;
}

export async function findRecommendation(ex: Executor, id: string) {
  const [row] = await ex
    .select({ rec: recommendations, kase: cases, customer: customers, action: actions })
    .from(recommendations)
    .innerJoin(cases, eq(recommendations.caseId, cases.id))
    .innerJoin(customers, eq(cases.customerId, customers.id))
    .innerJoin(actions, eq(recommendations.actionId, actions.id))
    .where(eq(recommendations.id, id))
    .limit(1);
  return row;
}

export async function listRecommendations(
  ex: Executor,
  filters: { status?: RecommendationStatus },
  paging: { limit: number; offset: number },
) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(recommendations.status, filters.status));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    ex
      .select({ rec: recommendations, kase: cases, customer: customers, action: actions })
      .from(recommendations)
      .innerJoin(cases, eq(recommendations.caseId, cases.id))
      .innerJoin(customers, eq(cases.customerId, customers.id))
      .innerJoin(actions, eq(recommendations.actionId, actions.id))
      .where(where)
      .orderBy(desc(recommendations.createdAt), asc(customers.id))
      .limit(paging.limit)
      .offset(paging.offset),
    ex.select({ n: count() }).from(recommendations).where(where),
  ]);
  return { rows, total: totalRow?.n ?? 0 };
}

export function findInterventionsForRecommendations(ex: Executor, ids: string[]) {
  if (!ids.length) return Promise.resolve([]);
  return ex
    .select({
      id: interventions.id,
      reference: interventions.reference,
      recommendationId: interventions.recommendationId,
    })
    .from(interventions)
    .where(inArray(interventions.recommendationId, ids));
}
