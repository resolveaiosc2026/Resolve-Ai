/** Recommend: live recommendation view, persisted recommendations. */
import { randomUUID } from 'node:crypto';

import { ACTION_OBJECTIVES } from '../../config/rules.js';
import { db, type Executor, type Transaction } from '../../db/client.js';
import type { recommendations } from '../../db/schema/index.js';
import type { ActionAlternative } from '../../db/schema/json-types.js';
import { conflict, notFound } from '../../lib/http-error.js';
import * as detectRepo from '../detect/detect.repository.js';
import type { Paging } from '../detect/detect.service.js';
import * as understandRepo from '../understand/understand.repository.js';
import { assembledCaseFor } from '../understand/understand.service.js';
import { channelLabel } from '../understand/view.js';
import {
  isPriorOffer,
  recommend,
  type ActionDef,
  type ReasonRef,
  type Recommendation,
} from './recommend.compute.js';
import * as repo from './recommend.repository.js';
import type { RecommendationStatus } from './recommend.repository.js';

export type RecommendationView = Recommendation & {
  caseId: string;
  customerId: string;
  reason: ReasonRef | null;
  current: RecommendationSummary | null;
};

type RecommendationRecord = typeof recommendations.$inferSelect;

export type RecommendationSummary = {
  id: string;
  actionId: string;
  status: RecommendationRecord['status'];
  predictedRecovery: number;
  createdAt: string;
};

const summarize = (r: RecommendationRecord): RecommendationSummary => ({
  id: r.id,
  actionId: r.actionId,
  status: r.status,
  predictedRecovery: r.predictedRecovery,
  createdAt: r.createdAt.toISOString(),
});

export async function actionLibrary(ex: Executor): Promise<ActionDef[]> {
  return (await repo.findActionLibrary(ex)).map((a) => ({
    id: a.id,
    name: a.name,
    shortName: a.shortName,
    price: a.price,
    currency: a.currency,
    sizeMb: a.sizeMb,
    validityHours: a.validityHours,
    reasons: a.reasons,
    mismatchNote: a.mismatchNote,
    channel: channelLabel(a.channel),
    channelId: a.channel,
    window: a.deliveryWindow,
    body: a.messageBody,
    eligibility: a.eligibilityRules,
  }));
}

/** The live recommendation for a customer's open case (mirrors the prototype's recommendAction). */
export async function recommendationViewWith(
  ex: Executor,
  customerId: string,
): Promise<RecommendationView> {
  const assembled = await assembledCaseFor(ex, customerId);
  const { row } = assembled;
  const [library, campaigns, reasonRows, classifications, runs, prior, existing] =
    await Promise.all([
      actionLibrary(ex),
      repo.findCampaigns(ex),
      understandRepo.findReasons(ex),
      understandRepo.findClassifications(ex, [row.caseId]),
      detectRepo.findRuns(ex, [assembled.runId]),
      repo.findCustomerInterventions(ex, customerId),
      repo.findCaseRecommendations(ex, row.caseId),
    ]);

  const reasonInfo = new Map(reasonRows.map((r) => [r.id, r]));
  const cls = classifications[0];
  const info = cls ? reasonInfo.get(cls.reasonId) : undefined;
  const reason: ReasonRef | null =
    cls && info
      ? { id: info.id, label: info.label, icon: info.icon, confidence: cls.confidence }
      : null;
  const runAt = runs[0]?.runAt ?? new Date();

  const result = recommend(
    library,
    campaigns.map((c) => ({
      reasonId: c.reasonId,
      actionId: c.actionId,
      recoveryRate: c.recoveryRate,
      n: c.sampleSize,
    })),
    new Map(reasonRows.map((r) => [r.id, r.label])),
    {
      daysSinceLastActivity: row.customer.daysSinceLastActivity,
      region: row.customer.region,
      careContacts30d: row.customer.careContacts30d,
      networkFaultReports30d: row.customer.networkFaultReports30d,
      baselineActivations: row.customer.baselineActivationsPerMonth,
      priorOffers: prior.filter((p) => isPriorOffer(p.handedOffAt ?? p.createdAt, runAt)).length,
    },
    reason,
  );

  return {
    caseId: row.caseId,
    customerId,
    reason,
    ...result,
    current: existing[0] ? summarize(existing[0]) : null,
  };
}

export function getRecommendationView(customerId: string) {
  return recommendationViewWith(db, customerId);
}

/** Persists the current best action as a pending recommendation (inside the caller's tx). */
export async function applyPersistRecommendation(tx: Transaction, customerId: string) {
  const assembled = await assembledCaseFor(tx, customerId);
  await understandRepo.lockCase(tx, assembled.row.caseId);

  const view = await recommendationViewWith(tx, customerId);
  if (!view.reason) throw conflict(`Customer ${customerId} has no reason yet; understand first`);
  if (!view.recommended) {
    throw conflict(
      `No eligible action for ${customerId}: ${view.notRecommended[0]?.rejectedReason ?? 'every action failed a check'}`,
    );
  }
  if (view.current?.status === 'pending') {
    throw conflict(
      `Customer ${customerId} already has a pending recommendation (${view.current.id})`,
    );
  }

  const best = view.recommended;
  const classifications = await understandRepo.findClassifications(tx, [view.caseId]);
  const alternatives: ActionAlternative[] = [
    ...view.candidates.slice(1),
    ...view.notRecommended,
  ].map((c) => ({
    actionId: c.action.id,
    predictedRecovery: c.predictedRecovery,
    eligible: c.eligible,
    rejectedReason: c.rejectedReason,
  }));
  const created = await repo.insertRecommendation(tx, {
    id: randomUUID(),
    caseId: view.caseId,
    classificationId: classifications[0]?.id ?? null,
    actionId: best.action.id,
    predictedRecovery: best.predictedRecovery,
    rationale: best.why,
    objective: ACTION_OBJECTIVES[best.action.id] ?? 'Recover bundle activity',
    eligibilityChecks: best.checks,
    alternatives,
    status: 'pending',
    createdAt: new Date(),
  });
  if (!created) throw new Error('Recommendation was not created');
  return created;
}

export async function persistRecommendation(customerId: string) {
  const created = await db.transaction((tx) => applyPersistRecommendation(tx, customerId));
  return getRecommendation(created.id);
}

/* --------------------------------- Reads ---------------------------------- */

type ListRow = Awaited<ReturnType<typeof repo.listRecommendations>>['rows'][number];

function toDto(r: ListRow, intervention?: { id: string; reference: string }) {
  return {
    id: r.rec.id,
    caseId: r.kase.id,
    customerId: r.customer.id,
    action: { id: r.action.id, name: r.action.name, shortName: r.action.shortName },
    predictedRecovery: r.rec.predictedRecovery,
    rationale: r.rec.rationale,
    objective: r.rec.objective,
    eligibilityChecks: r.rec.eligibilityChecks,
    alternatives: r.rec.alternatives,
    status: r.rec.status,
    decidedBy: r.rec.decidedBy,
    decidedAt: r.rec.decidedAt?.toISOString() ?? null,
    decisionNote: r.rec.decisionNote,
    createdAt: r.rec.createdAt.toISOString(),
    intervention: intervention ?? null,
  };
}

export async function getRecommendation(id: string, ex: Executor = db) {
  const row = await repo.findRecommendation(ex, id);
  if (!row) throw notFound(`Recommendation ${id} not found`);
  const [intervention] = await repo.findInterventionsForRecommendations(ex, [id]);
  return toDto(row, intervention);
}

export async function listRecommendations(
  filters: { status?: RecommendationStatus },
  paging: Paging,
) {
  const { rows, total } = await repo.listRecommendations(db, filters, {
    limit: paging.pageSize,
    offset: (paging.page - 1) * paging.pageSize,
  });
  const links = await repo.findInterventionsForRecommendations(
    db,
    rows.map((r) => r.rec.id),
  );
  return {
    total,
    rows: rows.map((r) =>
      toDto(
        r,
        links.find((l) => l.recommendationId === r.rec.id),
      ),
    ),
  };
}
