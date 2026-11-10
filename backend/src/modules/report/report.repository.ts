/** Report: Drizzle reads only. */
import { asc, desc, eq, isNotNull, lte, ne, and, inArray } from 'drizzle-orm';

import type { Executor } from '../../db/client.js';
import {
  actions,
  campaignHistory,
  cases,
  customerFeedback,
  customerWeeklyUsage,
  customers,
  detectionRuns,
  feedbackRequests,
  interventions,
  outcomes,
  reasonClassifications,
  reasons,
  recommendations,
} from '../../db/schema/index.js';

export function findOpenCases(ex: Executor) {
  return ex
    .select({ id: cases.id, customerId: cases.customerId, runId: cases.runId })
    .from(cases)
    .where(ne(cases.queueStatus, 'closed'));
}

export function findAllClassifications(ex: Executor) {
  return ex.select().from(reasonClassifications).orderBy(desc(reasonClassifications.createdAt));
}

export function findReasons(ex: Executor) {
  return ex.select().from(reasons).orderBy(asc(reasons.sortOrder));
}

export async function findPopulationRun(ex: Executor) {
  const [run] = await ex
    .select()
    .from(detectionRuns)
    .where(isNotNull(detectionRuns.populationSummary))
    .orderBy(desc(detectionRuns.runAt))
    .limit(1);
  return run;
}

export function findOutcomes(ex: Executor) {
  return ex.select().from(outcomes);
}

export function findInterventions(ex: Executor) {
  return ex.select().from(interventions);
}

export function findRecommendations(ex: Executor) {
  return ex.select().from(recommendations);
}

export function findRequests(ex: Executor) {
  return ex.select().from(feedbackRequests);
}

export function findFeedbackByIds(ex: Executor, ids: string[]) {
  if (!ids.length) return Promise.resolve([]);
  return ex.select().from(customerFeedback).where(inArray(customerFeedback.id, ids));
}

export function findCampaignsWithNames(ex: Executor) {
  return ex
    .select({
      reasonId: campaignHistory.reasonId,
      actionId: campaignHistory.actionId,
      actionName: actions.name,
      rate: campaignHistory.recoveryRate,
      n: campaignHistory.sampleSize,
    })
    .from(campaignHistory)
    .innerJoin(actions, eq(campaignHistory.actionId, actions.id))
    .orderBy(asc(campaignHistory.id));
}

export function findActions(ex: Executor) {
  return ex.select().from(actions).orderBy(asc(actions.sortOrder));
}

/** Weekly usage for customers with open cases, up to `asOfDay`. */
export function findWeeklyUsageForOpenCases(ex: Executor, asOfDay: string) {
  return ex
    .select({ weekStart: customerWeeklyUsage.weekStart, gb: customerWeeklyUsage.dataGb })
    .from(customerWeeklyUsage)
    .innerJoin(customers, eq(customerWeeklyUsage.customerId, customers.id))
    .innerJoin(cases, eq(cases.customerId, customers.id))
    .where(and(ne(cases.queueStatus, 'closed'), lte(customerWeeklyUsage.weekStart, asOfDay)));
}

export async function findLatestRunAt(ex: Executor) {
  const [run] = await ex
    .select({ runAt: detectionRuns.runAt })
    .from(detectionRuns)
    .orderBy(desc(detectionRuns.runAt))
    .limit(1);
  return run?.runAt ?? new Date();
}
