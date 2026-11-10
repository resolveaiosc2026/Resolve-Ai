/** Measure: simulated post-intervention window (demo), outcome measurement, measure view. */
import { randomUUID } from 'node:crypto';

import { MEASURE } from '../../config/rules.js';
import { db, type Executor, type Transaction } from '../../db/client.js';
import { conflict, notFound } from '../../lib/http-error.js';
import * as actRepo from '../act/act.repository.js';
import { summarizeActivations } from '../detect/scoring.js';
import * as detectRepo from '../detect/detect.repository.js';
import { actionLibrary } from '../recommend/recommend.service.js';
import * as understandRepo from '../understand/understand.repository.js';
import { assembledCaseFor } from '../understand/understand.service.js';
import { channelLabel, toFeedbackEntry } from '../understand/view.js';
import {
  buildTimeline,
  defaultScenario,
  measureOutcome,
  scenarioActivations,
  type Scenario,
} from './measure.compute.js';
import * as repo from './measure.repository.js';

const DAY_MS = 86_400_000;
const SIMULATED_BUNDLE = 'daily_600mb_usd';

async function interventionContext(ex: Executor, idOrReference: string) {
  const row = await actRepo.findIntervention(ex, idOrReference);
  if (!row) throw notFound(`Intervention ${idOrReference} not found`);
  const metrics = await detectRepo.findMetrics(ex, [row.kase.runId], [row.customer.id]);
  const baseline = metrics.find((m) => m.period === 'baseline')?.activations ?? 0;
  const flagged = metrics.find((m) => m.period === 'current')?.activations ?? 0;
  const start = row.intervention.handedOffAt ?? row.intervention.approvedAt;
  const windowEnd = new Date(start.getTime() + MEASURE.windowDays * DAY_MS);
  return { row, baseline, flagged, start, windowEnd };
}

/* ------------------------- Simulated window (demo) ------------------------- */

/** Demo only: Orange's workflow delivers and the customer's next 30 days are simulated. */
export async function applyAdvance(tx: Transaction, idOrReference: string, scenario?: Scenario) {
  const ctx = await interventionContext(tx, idOrReference);
  const i = ctx.row.intervention;
  await understandRepo.lockCase(tx, i.caseId);
  if (i.simulatedThrough) throw conflict(`${i.reference} has already been simulated`);
  if (i.status === 'failed' || i.status === 'cancelled') {
    throw conflict(`${i.reference} is ${i.status}; nothing to simulate`);
  }
  if (await repo.findOutcome(tx, i.id)) throw conflict(`${i.reference} already has an outcome`);

  const chosen = scenario ?? defaultScenario(i.reference, ctx.row.recommendation.predictedRecovery);
  const count = scenarioActivations(chosen, ctx.baseline, ctx.flagged);
  const bundle = await repo.findBundle(tx, SIMULATED_BUNDLE);
  if (!bundle) throw new Error(`Bundle ${SIMULATED_BUNDLE} missing; run npm run db:seed`);
  const span = ctx.windowEnd.getTime() - ctx.start.getTime();
  await repo.insertActivations(
    tx,
    Array.from({ length: count }, (_, k) => ({
      id: randomUUID(),
      customerId: ctx.row.customer.id,
      bundleId: bundle.id,
      dataMb: bundle.dataMb,
      pricePaid: bundle.price,
      currency: bundle.currency,
      activationChannel: 'ussd',
      status: 'success' as const,
      activatedAt: new Date(ctx.start.getTime() + ((k + 0.5) * span) / count),
    })),
  );
  await repo.updateIntervention(tx, i.id, {
    status: 'delivered',
    deliveredAt: new Date(ctx.start.getTime() + 3_600_000),
    simulatedThrough: ctx.windowEnd,
  });
  return {
    reference: i.reference,
    scenario: chosen,
    simulatedPurchases: count,
    windowEnd: ctx.windowEnd.toISOString(),
  };
}

export function advance(idOrReference: string, scenario?: Scenario) {
  return db.transaction((tx) => applyAdvance(tx, idOrReference, scenario));
}

/* -------------------------------- Outcome --------------------------------- */

export type OutcomeInput = { reviewerName?: string; notes?: string };

/** Measures the outcome from recorded purchases (inside the caller's transaction). */
export async function applyOutcome(tx: Transaction, idOrReference: string, input: OutcomeInput) {
  const ctx = await interventionContext(tx, idOrReference);
  const i = ctx.row.intervention;
  await understandRepo.lockCase(tx, i.caseId);
  if (await repo.findOutcome(tx, i.id)) throw conflict(`${i.reference} already has an outcome`);
  const horizon = Math.max(Date.now(), i.simulatedThrough?.getTime() ?? 0);
  if (horizon < ctx.windowEnd.getTime()) {
    throw conflict(
      `The ${MEASURE.windowDays}-day window for ${i.reference} closes ${ctx.windowEnd.toISOString()}; an empty outcome is a valid outcome until then`,
    );
  }

  const purchases = await repo.findPurchases(tx, ctx.row.customer.id, ctx.start, ctx.windowEnd);
  const after = purchases.filter((p) => p.status === 'success').length;
  const result = measureOutcome(ctx.baseline, ctx.flagged, after);
  const simulated = Boolean(i.simulatedThrough);
  const note =
    input.notes?.trim() ||
    (result.recovered
      ? "Usage returned toward the customer's own baseline."
      : 'Usage did not recover to the customer’s own baseline in the window.');

  const outcome = await repo.insertOutcome(tx, {
    id: randomUUID(),
    cohort: 'treated',
    caseId: i.caseId,
    interventionId: i.id,
    windowDays: MEASURE.windowDays,
    baselineActivations: ctx.baseline,
    activationsAfter: after,
    changePct: result.changePct,
    outcomeType: result.outcomeType,
    recovered: result.recovered,
    tolerancePct: MEASURE.tolerancePct,
    note: input.reviewerName ? `${note} (recorded by ${input.reviewerName})` : note,
    simulated,
    measuredAt: ctx.windowEnd,
  });

  const summary = summarizeActivations(
    purchases.map((p) => ({
      activatedAt: p.activatedAt,
      status: p.status,
      pricePaid: p.pricePaid,
      currency: p.currency,
    })),
    { from: ctx.start, to: ctx.windowEnd, months: 1 },
  );
  await repo.upsertMetric(tx, {
    runId: ctx.row.kase.runId,
    customerId: ctx.row.customer.id,
    period: 'post_intervention',
    activations: summary.activations,
    dataGb:
      Math.round(
        (purchases.filter((p) => p.status === 'success').reduce((s, p) => s + p.dataMb, 0) / 1024) *
          100,
      ) / 100,
    spendUsd: summary.spendUsd,
    spendLrd: summary.spendLrd,
    spendUsdEquivalent: summary.spendUsdEquivalent,
    activeDays: summary.activeDays,
    failedActivationRate: summary.failedActivationRate,
    daysSinceLastActivity: summary.daysSinceLastActivity,
  });
  if (!outcome) throw new Error('Outcome was not created');
  return { outcome, share: result.share };
}

export async function recordOutcome(idOrReference: string, input: OutcomeInput) {
  const { outcome, share } = await db.transaction((tx) => applyOutcome(tx, idOrReference, input));
  const intervention = await actRepo.findIntervention(db, outcome.interventionId ?? '');
  return {
    id: outcome.id,
    interventionId: intervention?.intervention.reference ?? outcome.interventionId,
    customerId: intervention?.customer.id ?? null,
    windowDays: outcome.windowDays,
    baselineActivations: outcome.baselineActivations,
    activationsAfter: outcome.activationsAfter,
    changePct: outcome.changePct,
    shareOfDropRecovered: share,
    outcomeType: outcome.outcomeType,
    recovered: outcome.recovered,
    simulated: outcome.simulated,
    note: outcome.note,
    measuredAt: outcome.measuredAt.toISOString(),
  };
}

/* ------------------------------ Measure view ------------------------------ */

/** Mirrors the prototype's measureView(): timeline, outcome, verdict, control summary. */
export async function measureViewWith(ex: Executor, customerId: string) {
  const assembled = await assembledCaseFor(ex, customerId);
  const { row } = assembled;
  const [requests, classifications, reasons, latest, controls, library] = await Promise.all([
    understandRepo.findRequests(ex, [row.caseId]),
    understandRepo.findClassifications(ex, [row.caseId]),
    understandRepo.findReasons(ex),
    repo.findLatestIntervention(ex, row.caseId),
    repo.findControls(ex),
    actionLibrary(ex),
  ]);
  const request = requests[0];
  const replies = request ? await understandRepo.findReplies(ex, [request.id]) : [];
  const reply = replies.find((r) => r.feedbackRequestId === request?.id);
  const cls = classifications[0];
  const feedback = request ? toFeedbackEntry(request, reply, cls) : null;
  const reasonLabel =
    reasons.find((r) => r.id === (cls?.reasonId ?? 'unknown'))?.label ?? 'Unknown';
  const i = latest?.intervention ?? null;
  const outcome = i ? await repo.findOutcome(ex, i.id) : undefined;
  const action = i ? (library.find((a) => a.id === i.actionId) ?? null) : null;

  const events = buildTimeline({
    segment: row.customer.segment,
    daysSinceLastActivity: row.customer.daysSinceLastActivity,
    flaggedAt: new Date(row.customer.flaggedAt),
    feedback:
      request && feedback
        ? {
            channel: feedback.channel,
            askedAt: request.createdAt,
            repliedAt: reply?.receivedAt ?? null,
            verbatim: feedback.verbatim,
            classifiedAt: feedback.classifiedAt ? new Date(feedback.classifiedAt) : null,
            classifiedBy: feedback.classifiedBy,
            reasonLabel,
            smsChannel: request.channel === 'sms',
          }
        : null,
    intervention:
      i && latest
        ? {
            actionName: action?.name ?? i.actionId,
            draftedAt: latest.recommendation.createdAt,
            approvedBy: i.approvedBy,
            approvedAt: i.approvedAt,
            sentAt: i.handedOffAt,
            status: i.status,
            channel: channelLabel(i.channel),
            clickRecorded: i.clickRecorded,
          }
        : null,
    outcome: outcome
      ? {
          recovered: outcome.recovered,
          windowDays: outcome.windowDays,
          measuredAt: outcome.measuredAt,
        }
      : null,
  });

  const controlRecovered = controls.filter((c) => c.recovered).length;
  return {
    caseId: row.caseId,
    customerId,
    events,
    outcome: outcome
      ? {
          interventionId: i?.reference ?? null,
          customerId,
          windowDays: outcome.windowDays,
          measuredAt: outcome.measuredAt.toISOString(),
          activationsAfter: outcome.activationsAfter,
          baselineActivations: outcome.baselineActivations,
          recovered: outcome.recovered,
          outcomeType: outcome.outcomeType,
          changePct: outcome.changePct,
          simulated: outcome.simulated,
          note: outcome.note,
        }
      : null,
    intervention:
      i && latest
        ? {
            id: i.reference,
            customerId,
            actionId: i.actionId,
            channel: channelLabel(i.channel),
            channelId: i.channel,
            draftedAt: latest.recommendation.createdAt.toISOString(),
            approvedBy: i.approvedBy,
            approvedAt: i.approvedAt.toISOString(),
            sentAt: i.handedOffAt?.toISOString() ?? null,
            delivered: i.status === 'delivered',
            status: i.status,
            clickRecorded: i.clickRecorded,
            deliveryWindow: i.deliveryWindow,
          }
        : null,
    action,
    verdict: outcome ? (outcome.recovered ? 'recovered' : 'not_recovered') : 'awaiting_window',
    activationsAfter: outcome?.activationsAfter ?? null,
    vsBaselinePct: outcome
      ? Math.round((outcome.activationsAfter / outcome.baselineActivations - 1) * 100)
      : null,
    controlSummary: {
      recovered: controlRecovered,
      total: controls.length,
      rate: controls.length ? Math.round((controlRecovered / controls.length) * 1000) / 1000 : 0,
    },
  };
}

export function getMeasureView(customerId: string) {
  return measureViewWith(db, customerId);
}
