/** Understand (evidence branch): reasons view, accept evidence, feedback queue, suggestions. */
import { randomUUID } from 'node:crypto';

import { DETECTION, EVIDENCE, SUGGESTED_CHANNEL } from '../../config/rules.js';
import { db, type Executor, type Transaction } from '../../db/client.js';
import { conflict, notFound } from '../../lib/http-error.js';
import * as detectRepo from '../detect/detect.repository.js';
import type { CaseRow } from '../detect/detect.repository.js';
import { assembleCases, type AssembledCase, type Paging } from '../detect/detect.service.js';
import {
  awaitingEvidence,
  decideNextStep,
  evaluateEvidence,
  evidenceItems,
  isStrong,
  type EvidenceInput,
} from './evidence.compute.js';
import type { ReasonId } from './keyword-classifier.js';
import * as repo from './understand.repository.js';
import type { FeedbackFilters } from './understand.repository.js';
import {
  channelLabel,
  toCandidate,
  toFeedbackEntry,
  type ClassificationView,
  type ReasonInfo,
} from './view.js';

const DAY_MS = 86_400_000;
const pct = (v: number) => Math.round(v * 100);

/* ------------------------------ Evidence inputs ----------------------------- */

const avgPrice = (spend?: number, activations?: number) =>
  spend !== undefined && activations ? spend / activations : null;

/** Evidence inputs for each assembled case (batched: one attempts query, one incidents query). */
async function evidenceInputs(
  ex: Executor,
  cases: AssembledCase[],
): Promise<Map<string, EvidenceInput>> {
  const result = new Map<string, EvidenceInput>();
  if (!cases.length) return result;

  const runIds = [...new Set(cases.map((c) => c.runId))];
  const runs = await detectRepo.findRuns(ex, runIds);
  const asOfByRun = new Map(runs.map((r) => [r.id, r.runAt]));
  const asOfs = runs.map((r) => r.runAt.getTime());
  const windowDays = DETECTION.signalWindowDays * DAY_MS;
  const [attempts, incidents] = await Promise.all([
    repo.findAttempts(
      ex,
      cases.map((c) => c.row.customer.id),
      new Date(Math.min(...asOfs) - windowDays),
      new Date(Math.max(...asOfs)),
    ),
    repo.findRegionalIncidents(ex),
  ]);

  for (const c of cases) {
    const asOf = asOfByRun.get(c.runId);
    if (!asOf) continue;
    const from = new Date(asOf.getTime() - windowDays);
    const mine = attempts.filter(
      (a) => a.customerId === c.row.customer.id && a.activatedAt > from && a.activatedAt <= asOf,
    );
    const incident = incidents
      .filter(
        (i) =>
          i.region === c.row.customer.region &&
          i.reportedAt <= asOf &&
          (!i.resolvedAt || i.resolvedAt > from),
      )
      .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime())[0];

    result.set(c.row.caseId, {
      region: c.row.customer.region,
      failedAttempts: mine.filter((a) => a.status === 'failed').length,
      totalAttempts: mine.length,
      ownFaultReports30d: c.row.customer.networkFaultReports30d,
      regionalIncident: incident ? { reportedAt: incident.reportedAt } : null,
      avgPriceUsdEqBaseline: avgPrice(
        c.metrics.baseline?.spendUsdEquivalent,
        c.metrics.baseline?.activations,
      ),
      avgPriceUsdEqCurrent: avgPrice(
        c.metrics.current?.spendUsdEquivalent,
        c.metrics.current?.activations,
      ),
    });
  }
  return result;
}

/* --------------------------------- Views ---------------------------------- */

async function buildViews(ex: Executor, cases: AssembledCase[]): Promise<ClassificationView[]> {
  if (!cases.length) return [];
  const caseIds = cases.map((c) => c.row.caseId);
  const [classifications, requests, reasonRows, inputs] = await Promise.all([
    repo.findClassifications(ex, caseIds),
    repo.findRequests(ex, caseIds),
    repo.findReasons(ex),
    evidenceInputs(ex, cases),
  ]);
  const replies = await repo.findReplies(
    ex,
    requests.map((r) => r.id),
  );
  const reasons = new Map<string, ReasonInfo>(
    reasonRows.map((r) => [r.id, { id: r.id, label: r.label, icon: r.icon }]),
  );
  const label = (id: string) => reasons.get(id)?.label ?? id;

  return cases.map(({ row }) => {
    const cls = classifications.find((c) => c.caseId === row.caseId);
    const request = requests.find((r) => r.caseId === row.caseId);
    const reply = request ? replies.find((r) => r.feedbackRequestId === request.id) : undefined;
    const input = inputs.get(row.caseId);
    const signals = input ? evaluateEvidence(input) : [];
    const nextStep = decideNextStep({
      hasClassification: Boolean(cls),
      strongest: signals[0],
      hasOpenRequest: Boolean(
        request && (request.status === 'pending' || request.status === 'handed_off'),
      ),
      band: row.priority.band,
    });
    const assessment = {
      nextStep,
      reasonKnown: Boolean(cls) || isStrong(signals[0]),
      signals: signals.map((s) => ({ ...s, label: label(s.reasonId) })),
    };
    const feedback = request ? toFeedbackEntry(request, reply, cls) : null;

    if (cls) {
      return {
        caseId: row.caseId,
        status: 'classified' as const,
        primary: toCandidate(cls.reasonId, cls.confidence, reasons),
        alternatives: cls.alternatives.map((a) => toCandidate(a.reasonId, a.confidence, reasons)),
        evidence: cls.evidence,
        feedback,
        source: cls.source,
        review:
          cls.reviewedBy && cls.reviewedReasonId && cls.reviewedAt
            ? {
                reasonId: cls.reviewedReasonId,
                reviewedBy: cls.reviewedBy,
                reviewedAt: cls.reviewedAt.toISOString(),
              }
            : null,
        assessment,
      };
    }
    return {
      caseId: row.caseId,
      status:
        row.status === 'unclassified' ? ('unclassified' as const) : ('awaiting_reply' as const),
      primary: null,
      alternatives: [],
      evidence: awaitingEvidence({
        activationsNow: row.customer.activationsPerMonthNow,
        baselineActivations: row.customer.baselineActivationsPerMonth,
        changePct: row.usage.changePct,
        networkFaultReports30d: row.customer.networkFaultReports30d,
        region: row.customer.region,
      }),
      feedback,
      source: null,
      review: null,
      assessment,
    };
  });
}

async function assembledCaseFor(ex: Executor, customerId: string): Promise<AssembledCase> {
  const row = await detectRepo.findCaseRowByCustomer(ex, customerId);
  if (!row) throw notFound(`No open case for customer ${customerId}`);
  const [assembled] = await assembleCases(ex, [row]);
  if (!assembled) throw notFound(`No open case for customer ${customerId}`);
  return assembled;
}

export async function getReasons(customerId: string): Promise<ClassificationView> {
  const [view] = await buildViews(db, [await assembledCaseFor(db, customerId)]);
  if (!view) throw notFound(`No open case for customer ${customerId}`);
  return view;
}

/* ---------------------------- Accept evidence ----------------------------- */

/** Human-confirmed: stores strong behavioural evidence as the case's reason; case → ready. */
export async function acceptEvidence(
  customerId: string,
  reviewerName: string,
): Promise<ClassificationView> {
  await db.transaction((tx) => applyEvidence(tx, customerId, reviewerName));
  return getReasons(customerId);
}

/** The accept-evidence writes, inside the caller's transaction (lets verification roll back). */
export async function applyEvidence(
  tx: Transaction,
  customerId: string,
  reviewerName: string,
): Promise<void> {
  const assembled = await assembledCaseFor(tx, customerId);
  const caseId = assembled.row.caseId;
  await repo.lockCase(tx, caseId);

  if ((await repo.findClassifications(tx, [caseId])).length) {
    throw conflict(`Customer ${customerId} already has a reason; evidence was not applied`);
  }
  const input = (await evidenceInputs(tx, [assembled])).get(caseId);
  const signals = input ? evaluateEvidence(input) : [];
  const strongest = signals[0];
  if (!strongest || !isStrong(strongest)) {
    const strength = strongest ? `${pct(strongest.strength)}%` : 'none';
    throw conflict(
      `Evidence is not strong enough (strongest: ${strength}, needs 80%); request customer feedback instead`,
    );
  }

  const reasons = new Map((await repo.findReasons(tx)).map((r) => [r.id, r.label]));
  const label = (id: ReasonId) => reasons.get(id) ?? id;
  const now = new Date();
  await repo.insertClassification(tx, {
    id: randomUUID(),
    caseId,
    feedbackId: null,
    reasonId: strongest.reasonId,
    confidence: strongest.strength,
    alternatives: signals.slice(1).map((s) => ({ reasonId: s.reasonId, confidence: s.strength })),
    sentiment: null,
    summary: `Behavioural evidence points to ${label(strongest.reasonId).toLowerCase()} (${pct(strongest.strength)}% strength), confirmed by ${reviewerName}.`,
    evidence: evidenceItems(signals, label),
    source: 'evidence',
    classifiedBy: EVIDENCE.modelVersion,
    needsReview: false,
    reviewedReasonId: strongest.reasonId,
    reviewedBy: reviewerName,
    reviewedAt: now,
    createdAt: now,
  });
  await repo.setCaseStatus(tx, caseId, 'ready');
}

/* --------------------------- Feedback queue ------------------------------- */

export async function listFeedbackRequests(filters: FeedbackFilters, paging: Paging) {
  const { rows, total } = await repo.findFeedbackQueue(db, filters, {
    limit: paging.pageSize,
    offset: (paging.page - 1) * paging.pageSize,
  });
  const replies = await repo.findReplies(
    db,
    rows.map((r) => r.request.id),
  );
  return {
    total,
    rows: rows.map(({ request, kase, customer }) => {
      const reply = replies.find((r) => r.feedbackRequestId === request.id);
      return {
        id: request.id,
        caseId: kase.id,
        customerId: customer.id,
        segment: customer.segment,
        region: customer.region,
        priority: { total: kase.priorityScore, band: kase.priorityBand },
        queueStatus: kase.queueStatus,
        channel: channelLabel(request.channel),
        channelId: request.channel,
        question: request.question,
        status: request.status,
        triggerReason: request.triggerReason,
        createdAt: request.createdAt.toISOString(),
        handedOffAt: request.handedOffAt?.toISOString() ?? null,
        respondedAt: request.respondedAt?.toISOString() ?? null,
        reply: reply ? { text: reply.rawText, receivedAt: reply.receivedAt.toISOString() } : null,
      };
    }),
  };
}

/* ------------------------------ Suggestions ------------------------------- */

function suggestedChannel(row: CaseRow) {
  return row.kase.priorityBand === 'high' || row.customer.valueTier === 'high'
    ? SUGGESTED_CHANNEL.highTouch
    : SUGGESTED_CHANNEL.default;
}

/** Cases that need a feedback request (Resolve AI suggests; Orange's channel contacts the customer). */
export async function getSuggestions() {
  const candidates = await repo.findSuggestionCandidates(db);
  const assembled = await assembleCases(db, candidates);
  const inputs = await evidenceInputs(db, assembled);
  return assembled
    .map((a, i) => {
      const input = inputs.get(a.row.caseId);
      return { a, row: candidates[i], signals: input ? evaluateEvidence(input) : [] };
    })
    .filter(({ signals }) => !isStrong(signals[0]))
    .map(({ a, row, signals }) => {
      const channel = row ? suggestedChannel(row) : SUGGESTED_CHANNEL.default;
      return {
        caseId: a.row.caseId,
        customerId: a.row.customer.id,
        segment: a.row.customer.segment,
        region: a.row.customer.region,
        valueTier: a.row.customer.valueTier,
        priority: { total: a.row.priority.total, band: a.row.priority.band },
        queueStatus: a.row.status,
        suggestedChannel: channel,
        channelLabel: channelLabel(channel),
        trigger: signals.length ? ('low_confidence' as const) : ('no_evidence' as const),
        signals,
      };
    });
}
