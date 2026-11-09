/** Understand (channels): Drizzle queries for hand-offs, replies, inbound feedback, overrides. */
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import type { Executor } from '../../db/client.js';
import {
  cases,
  customerFeedback,
  customers,
  feedbackRequests,
  reasonClassifications,
} from '../../db/schema/index.js';

export async function findRequestWithCase(ex: Executor, requestId: string) {
  const [row] = await ex
    .select({ request: feedbackRequests, kase: cases, customer: customers })
    .from(feedbackRequests)
    .innerJoin(cases, eq(feedbackRequests.caseId, cases.id))
    .innerJoin(customers, eq(cases.customerId, customers.id))
    .where(eq(feedbackRequests.id, requestId))
    .limit(1);
  return row;
}

/** Requests for the case that are still waiting for an answer, newest first. */
export function findOpenRequests(ex: Executor, caseId: string) {
  return ex
    .select()
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.caseId, caseId),
        inArray(feedbackRequests.status, ['pending', 'handed_off']),
      ),
    )
    .orderBy(desc(feedbackRequests.createdAt));
}

export async function markNoResponse(ex: Executor, requestIds: string[]) {
  if (!requestIds.length) return;
  await ex
    .update(feedbackRequests)
    .set({ status: 'no_response' })
    .where(inArray(feedbackRequests.id, requestIds));
}

export async function insertRequest(ex: Executor, row: typeof feedbackRequests.$inferInsert) {
  const [created] = await ex.insert(feedbackRequests).values(row).returning();
  return created;
}

export async function markResponded(ex: Executor, requestId: string, respondedAt: Date) {
  await ex
    .update(feedbackRequests)
    .set({ status: 'responded', respondedAt })
    .where(eq(feedbackRequests.id, requestId));
}

export async function insertFeedback(ex: Executor, row: typeof customerFeedback.$inferInsert) {
  const [created] = await ex.insert(customerFeedback).values(row).returning();
  return created;
}

export async function findCustomer(ex: Executor, customerId: string) {
  const [row] = await ex.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  return row;
}

export async function findOpenCaseId(ex: Executor, customerId: string) {
  const [row] = await ex
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.customerId, customerId), ne(cases.queueStatus, 'closed')))
    .orderBy(desc(cases.flaggedAt))
    .limit(1);
  return row?.id ?? null;
}

export async function findClassificationWithCustomer(ex: Executor, classificationId: string) {
  const [row] = await ex
    .select({ classification: reasonClassifications, customerId: cases.customerId })
    .from(reasonClassifications)
    .innerJoin(cases, eq(reasonClassifications.caseId, cases.id))
    .where(eq(reasonClassifications.id, classificationId))
    .limit(1);
  return row;
}

export async function markReviewed(
  ex: Executor,
  classificationId: string,
  review: { reviewedReasonId: string; reviewedBy: string; reviewedAt: Date },
) {
  await ex
    .update(reasonClassifications)
    .set({ ...review, needsReview: false })
    .where(eq(reasonClassifications.id, classificationId));
}
