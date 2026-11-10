/**
 * Act: a human approves, changes or rejects a pending recommendation. Approval creates an
 * intervention handed off to Orange's existing workflow (Resolve AI sends nothing itself).
 */
import { randomUUID } from 'node:crypto';

import type { Channel } from '../../config/rules.js';
import { db, type Executor, type Transaction } from '../../db/client.js';
import { conflict, notFound } from '../../lib/http-error.js';
import type { Paging } from '../detect/detect.service.js';
import * as understandRepo from '../understand/understand.repository.js';
import { channelLabel } from '../understand/view.js';
import * as repo from './act.repository.js';
import type { InterventionStatus } from './act.repository.js';

export type ApproveInput = {
  reviewerName: string;
  actionId?: string;
  channel?: Channel;
  window?: string;
  note?: string;
};

export type RejectInput = { reviewerName: string; note: string };

/** Approve (or change and approve) inside the caller's transaction. Returns the intervention id. */
export async function applyApprove(tx: Transaction, recommendationId: string, input: ApproveInput) {
  const rec = await repo.lockRecommendation(tx, recommendationId);
  if (!rec) throw notFound(`Recommendation ${recommendationId} not found`);
  await understandRepo.lockCase(tx, rec.caseId);
  if (rec.status !== 'pending') {
    throw conflict(
      `Recommendation is already ${rec.status}; only pending recommendations can be approved`,
    );
  }

  const chosenId = input.actionId ?? rec.actionId;
  const changed = chosenId !== rec.actionId;
  if (changed && !rec.alternatives.some((a) => a.actionId === chosenId && a.eligible)) {
    throw conflict(`Action ${chosenId} is not an eligible alternative for this case`);
  }
  const [action] = await repo.findAction(tx, chosenId);
  if (!action) throw notFound(`Action ${chosenId} not found`);

  const now = new Date();
  const decisionNote =
    input.note?.trim() ||
    (changed ? `Action changed to ${action.name} and approved.` : 'Approved as recommended.');
  const intervention = await repo.insertIntervention(tx, {
    id: randomUUID(),
    reference: await repo.nextInterventionReference(tx),
    recommendationId: rec.id,
    caseId: rec.caseId,
    actionId: action.id,
    channel: input.channel ?? action.channel,
    approvedBy: input.reviewerName,
    approvedAt: now,
    status: 'handed_off',
    handedOffAt: now,
    deliveryWindow: input.window ?? action.deliveryWindow,
    note: decisionNote,
    createdAt: now,
  });
  await repo.decideRecommendation(tx, rec.id, {
    status: 'approved',
    decidedBy: input.reviewerName,
    decidedAt: now,
    decisionNote,
  });
  await understandRepo.setCaseStatus(tx, rec.caseId, 'action_done');
  if (!intervention) throw new Error('Intervention was not created');
  return {
    interventionId: intervention.id,
    decision: changed ? ('changed' as const) : ('approved' as const),
  };
}

export async function approve(recommendationId: string, input: ApproveInput) {
  const { interventionId, decision } = await db.transaction((tx) =>
    applyApprove(tx, recommendationId, input),
  );
  return { decision, intervention: await getIntervention(interventionId) };
}

/** "Send to human review": the recommendation is rejected and the case needs a human read. */
export async function applyReject(tx: Transaction, recommendationId: string, input: RejectInput) {
  const rec = await repo.lockRecommendation(tx, recommendationId);
  if (!rec) throw notFound(`Recommendation ${recommendationId} not found`);
  await understandRepo.lockCase(tx, rec.caseId);
  if (rec.status !== 'pending') {
    throw conflict(
      `Recommendation is already ${rec.status}; only pending recommendations can be rejected`,
    );
  }
  await repo.decideRecommendation(tx, rec.id, {
    status: 'rejected',
    decidedBy: input.reviewerName,
    decidedAt: new Date(),
    decisionNote: input.note,
  });
  await understandRepo.setCaseStatus(tx, rec.caseId, 'unclassified');
}

export async function reject(recommendationId: string, input: RejectInput) {
  await db.transaction((tx) => applyReject(tx, recommendationId, input));
  return { recommendationId, status: 'rejected' as const, caseStatus: 'unclassified' as const };
}

/* --------------------------------- Reads ---------------------------------- */

type InterventionRow = NonNullable<Awaited<ReturnType<typeof repo.findIntervention>>>;

function toDto(r: InterventionRow, hasOutcome: boolean) {
  const i = r.intervention;
  return {
    id: i.id,
    reference: i.reference,
    recommendationId: i.recommendationId,
    caseId: r.kase.id,
    customerId: r.customer.id,
    action: { id: r.action.id, name: r.action.name, shortName: r.action.shortName },
    recommendedActionId: r.recommendation.actionId,
    decision: r.recommendation.actionId === i.actionId ? 'approved' : 'changed',
    channel: channelLabel(i.channel),
    channelId: i.channel,
    deliveryWindow: i.deliveryWindow,
    approvedBy: i.approvedBy,
    approvedAt: i.approvedAt.toISOString(),
    status: i.status,
    handedOffAt: i.handedOffAt?.toISOString() ?? null,
    deliveredAt: i.deliveredAt?.toISOString() ?? null,
    clickRecorded: i.clickRecorded,
    note: i.note,
    simulatedThrough: i.simulatedThrough?.toISOString() ?? null,
    hasOutcome,
  };
}

export async function getIntervention(idOrReference: string, ex: Executor = db) {
  const row = await repo.findIntervention(ex, idOrReference);
  if (!row) throw notFound(`Intervention ${idOrReference} not found`);
  const [outcome] = await repo.findOutcomeForIntervention(ex, row.intervention.id);
  return toDto(row, Boolean(outcome));
}

export async function listInterventions(filters: { status?: InterventionStatus }, paging: Paging) {
  const { rows, total } = await repo.listInterventions(db, filters, {
    limit: paging.pageSize,
    offset: (paging.page - 1) * paging.pageSize,
  });
  const withOutcomes = await Promise.all(
    rows.map(async (r) => {
      const [o] = await repo.findOutcomeForIntervention(db, r.intervention.id);
      return toDto(r, Boolean(o));
    }),
  );
  return { total, rows: withOutcomes };
}
