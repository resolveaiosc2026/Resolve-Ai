/** Understand: Drizzle queries only (no business logic). */
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  notExists,
  sql,
  type SQL,
} from 'drizzle-orm';

import type { Channel } from '../../config/rules.js';
import type { Executor } from '../../db/client.js';
import {
  bundleActivations,
  cases,
  customerFeedback,
  customers,
  feedbackRequests,
  networkFaults,
  reasonClassifications,
  reasons,
} from '../../db/schema/index.js';
import type { CaseRow } from '../detect/detect.repository.js';

export type FeedbackRequestStatus = (typeof feedbackRequests.$inferSelect)['status'];

export function findReasons(ex: Executor) {
  return ex.select().from(reasons).orderBy(asc(reasons.sortOrder));
}

/** All classifications for the cases, newest first. */
export function findClassifications(ex: Executor, caseIds: string[]) {
  return ex
    .select()
    .from(reasonClassifications)
    .where(inArray(reasonClassifications.caseId, caseIds))
    .orderBy(desc(reasonClassifications.createdAt));
}

/** All feedback requests for the cases, newest first. */
export function findRequests(ex: Executor, caseIds: string[]) {
  return ex
    .select()
    .from(feedbackRequests)
    .where(inArray(feedbackRequests.caseId, caseIds))
    .orderBy(desc(feedbackRequests.createdAt));
}

export function findReplies(ex: Executor, requestIds: string[]) {
  if (!requestIds.length) return Promise.resolve([]);
  return ex
    .select()
    .from(customerFeedback)
    .where(inArray(customerFeedback.feedbackRequestId, requestIds))
    .orderBy(desc(customerFeedback.receivedAt));
}

/** Purchase attempts (any status) for the customers in (from, to]. */
export function findAttempts(ex: Executor, customerIds: string[], from: Date, to: Date) {
  return ex
    .select({
      customerId: bundleActivations.customerId,
      status: bundleActivations.status,
      activatedAt: bundleActivations.activatedAt,
    })
    .from(bundleActivations)
    .where(
      and(
        inArray(bundleActivations.customerId, customerIds),
        gt(bundleActivations.activatedAt, from),
        lte(bundleActivations.activatedAt, to),
      ),
    );
}

/** Regional incidents (network monitoring, not tied to one customer). */
export function findRegionalIncidents(ex: Executor) {
  return ex
    .select()
    .from(networkFaults)
    .where(and(isNull(networkFaults.customerId), eq(networkFaults.source, 'network_monitoring')));
}

/** Locks the case row for the rest of the transaction (prevents double accepts). */
export async function lockCase(ex: Executor, caseId: string) {
  await ex.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId)).for('update');
}

export async function insertClassification(
  ex: Executor,
  row: typeof reasonClassifications.$inferInsert,
) {
  await ex.insert(reasonClassifications).values(row);
}

export async function setCaseStatus(
  ex: Executor,
  caseId: string,
  queueStatus: (typeof cases.$inferSelect)['queueStatus'],
) {
  await ex.update(cases).set({ queueStatus }).where(eq(cases.id, caseId));
}

/* ------------------------------ Feedback queue ----------------------------- */

export type FeedbackFilters = { status?: FeedbackRequestStatus; channel?: Channel };

export async function findFeedbackQueue(
  ex: Executor,
  filters: FeedbackFilters,
  paging: { limit: number; offset: number },
) {
  const conditions: SQL[] = [ne(cases.queueStatus, 'closed')];
  if (filters.status) conditions.push(eq(feedbackRequests.status, filters.status));
  if (filters.channel) conditions.push(eq(feedbackRequests.channel, filters.channel));
  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    ex
      .select({ request: feedbackRequests, kase: cases, customer: customers })
      .from(feedbackRequests)
      .innerJoin(cases, eq(feedbackRequests.caseId, cases.id))
      .innerJoin(customers, eq(cases.customerId, customers.id))
      .where(where)
      .orderBy(desc(cases.priorityScore), asc(customers.id), desc(feedbackRequests.createdAt))
      .limit(paging.limit)
      .offset(paging.offset),
    ex
      .select({ n: count() })
      .from(feedbackRequests)
      .innerJoin(cases, eq(feedbackRequests.caseId, cases.id))
      .where(where),
  ]);
  return { rows, total: totalRow?.n ?? 0 };
}

/**
 * Prioritized open cases with no reason yet and no open or answered feedback request:
 * candidates for a new request (evidence is checked by the service).
 */
export function findSuggestionCandidates(ex: Executor): Promise<CaseRow[]> {
  return ex
    .select({ customer: customers, kase: cases })
    .from(cases)
    .innerJoin(customers, eq(cases.customerId, customers.id))
    .where(
      and(
        ne(cases.queueStatus, 'closed'),
        inArray(cases.priorityBand, ['high', 'medium']),
        notExists(
          ex
            .select({ one: sql`1` })
            .from(reasonClassifications)
            .where(eq(reasonClassifications.caseId, cases.id)),
        ),
        notExists(
          ex
            .select({ one: sql`1` })
            .from(feedbackRequests)
            .where(
              and(
                eq(feedbackRequests.caseId, cases.id),
                inArray(feedbackRequests.status, ['pending', 'handed_off', 'responded']),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(cases.priorityScore), asc(customers.id));
}
