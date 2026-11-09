/**
 * Understand (channels + AI): hand feedback requests to Orange channels, ingest the replies
 * the channels return, record inbound feedback, and let a human override the reason.
 * Resolve AI never contacts customers itself.
 */
import { randomUUID } from 'node:crypto';

import { CLASSIFICATION, FEEDBACK, type Channel } from '../../config/rules.js';
import { db, type Executor, type Transaction } from '../../db/client.js';
import type { EvidenceItem } from '../../db/schema/json-types.js';
import { conflict, notFound } from '../../lib/http-error.js';
import { classifyFeedback, type FeedbackClassificationResult } from '../ai/classify-feedback.js';
import type { TaxonomyEntry } from '../ai/llm-provider.js';
import type { AssembledCase } from '../detect/detect.service.js';
import { evaluateEvidence } from './evidence.compute.js';
import type { ClassifierFacts } from './keyword-classifier.js';
import * as repo from './channels.repository.js';
import * as understandRepo from './understand.repository.js';
import { assembledCaseFor, evidenceInputs, getReasonsWith } from './understand.service.js';
import { channelLabel, type ClassificationView } from './view.js';

const DAY_MS = 86_400_000;

export type OutboundChannel = (typeof FEEDBACK.outboundChannels)[number];
export type InboundChannel = (typeof FEEDBACK.inboundChannels)[number];

async function taxonomy(ex: Executor): Promise<TaxonomyEntry[]> {
  return (await understandRepo.findReasons(ex)).map((r) => ({ id: r.id, label: r.label }));
}

function factsFor(a: AssembledCase): ClassifierFacts {
  return {
    dropPct: a.row.usage.dropPct,
    tenureMonths: a.row.customer.tenureMonths,
    careContacts30d: a.row.customer.careContacts30d,
    networkFaultReports30d: a.row.customer.networkFaultReports30d,
    activationsNow: a.row.customer.activationsPerMonthNow,
  };
}

/** Evidence stored with a classification that came from a reply. */
function replyEvidence(text: string, summary: string, a: AssembledCase): EvidenceItem[] {
  const c = a.row.customer;
  return [
    {
      kind: 'behavioural',
      title: "Behavioural signal — the customer's own words",
      body: `"${text}" — ${summary}`,
    },
    {
      kind: 'usage',
      title: 'Usage pattern',
      body: `${c.activationsPerMonthNow} bundle activations this month against their own baseline of ${c.baselineActivationsPerMonth} per month (${a.row.usage.changePct}%).`,
    },
    {
      kind: 'exclusion',
      title: 'Network faults checked',
      body:
        c.networkFaultReports30d === 0
          ? `No fault reported from this customer in ${c.daysSinceLastActivity} days, and no fault logged in ${c.region}. Network quality is not supported by the evidence.`
          : `${c.networkFaultReports30d} fault report(s) from this customer in the last 30 days.`,
    },
  ];
}

/* --------------------------------- Hand-off -------------------------------- */

export type HandOffInput = { channel: OutboundChannel; reviewerName: string; question?: string };

/** Records a request handed off to an Orange channel (inside the caller's transaction). */
export async function applyHandOff(tx: Transaction, customerId: string, input: HandOffInput) {
  const assembled = await assembledCaseFor(tx, customerId);
  const caseId = assembled.row.caseId;
  await understandRepo.lockCase(tx, caseId);

  if ((await understandRepo.findClassifications(tx, [caseId])).length) {
    throw conflict(`Customer ${customerId} already has a reason; no feedback request needed`);
  }
  const now = new Date();
  const open = await repo.findOpenRequests(tx, caseId);
  const expiry = now.getTime() - FEEDBACK.replyWindowDays * DAY_MS;
  const stillOpen = open.filter((r) => (r.handedOffAt ?? r.createdAt).getTime() > expiry);
  if (stillOpen.length) {
    throw conflict(
      `An ask was handed off ${stillOpen[0]?.handedOffAt?.toISOString() ?? 'recently'} and is still within the ${FEEDBACK.replyWindowDays}-day reply window`,
    );
  }
  // Unanswered asks older than the reply window become `no_response` (follow-up allowed).
  await repo.markNoResponse(
    tx,
    open.map((r) => r.id),
  );

  const input_ = (await evidenceInputs(tx, [assembled])).get(caseId);
  const signals = input_ ? evaluateEvidence(input_) : [];
  const request = await repo.insertRequest(tx, {
    id: randomUUID(),
    caseId,
    channel: input.channel,
    question: input.question ?? FEEDBACK.questions[input.channel],
    triggerReason: signals.length ? 'low_confidence' : 'no_evidence',
    status: 'handed_off',
    createdAt: now,
    handedOffAt: now,
  });
  await understandRepo.setCaseStatus(tx, caseId, 'awaiting_reply');
  if (!request) throw new Error('Feedback request was not created');
  return { request, followedUp: open.map((r) => r.id), handedOffBy: input.reviewerName };
}

export async function handOff(customerId: string, input: HandOffInput) {
  const { request, followedUp, handedOffBy } = await db.transaction((tx) =>
    applyHandOff(tx, customerId, input),
  );
  return {
    id: request.id,
    caseId: request.caseId,
    customerId,
    channel: channelLabel(request.channel),
    channelId: request.channel,
    question: request.question,
    status: request.status,
    triggerReason: request.triggerReason,
    handedOffAt: request.handedOffAt?.toISOString() ?? null,
    handedOffBy,
    previousRequestsMarkedNoResponse: followedUp.length,
    note: 'Handed off to the Orange channel. Resolve AI does not contact the customer.',
  };
}

/* ------------------------------ Reply ingestion ----------------------------- */

export type ReplyInput = { text: string; receivedAt?: Date; simulated: boolean };

type PreparedReply = {
  requestId: string;
  customerId: string;
  assembled: AssembledCase;
  classification: FeedbackClassificationResult;
};

/** Loads the request and classifies the reply OUTSIDE any transaction (the LLM may be slow). */
export async function prepareReply(
  ex: Executor,
  requestId: string,
  text: string,
  options: { useLlm?: boolean } = {},
): Promise<PreparedReply> {
  const found = await repo.findRequestWithCase(ex, requestId);
  if (!found) throw notFound(`Feedback request ${requestId} not found`);
  if (found.request.status === 'responded') {
    throw conflict('This feedback request already has a reply');
  }
  const assembled = await assembledCaseFor(ex, found.customer.id);
  const classification = await classifyFeedback(
    text,
    factsFor(assembled),
    await taxonomy(ex),
    options,
  );
  return { requestId, customerId: found.customer.id, assembled, classification };
}

/** Stores the reply and its classification (inside the caller's transaction). */
export async function applyReply(tx: Transaction, prepared: PreparedReply, input: ReplyInput) {
  const { assembled, classification: c } = prepared;
  const caseId = assembled.row.caseId;
  await understandRepo.lockCase(tx, caseId);

  const found = await repo.findRequestWithCase(tx, prepared.requestId);
  if (!found) throw notFound(`Feedback request ${prepared.requestId} not found`);
  if (found.request.status === 'responded')
    throw conflict('This feedback request already has a reply');

  const receivedAt = input.receivedAt ?? new Date();
  const reply = await repo.insertFeedback(tx, {
    id: randomUUID(),
    customerId: found.customer.id,
    caseId,
    feedbackRequestId: found.request.id,
    channel: found.request.channel,
    region: found.customer.region,
    rawText: input.text,
    simulated: input.simulated,
    receivedAt,
  });
  await repo.markResponded(tx, found.request.id, receivedAt);

  // A reason set meanwhile (evidence or a human) is never overwritten by a late reply.
  if ((await understandRepo.findClassifications(tx, [caseId])).length) {
    return { stored: 'reply_only' as const, replyId: reply?.id ?? null };
  }
  await understandRepo.insertClassification(tx, {
    id: randomUUID(),
    caseId,
    feedbackId: reply?.id ?? null,
    reasonId: c.reasonId,
    confidence: c.confidence,
    alternatives: c.alternatives,
    sentiment: c.sentiment,
    summary: c.summary,
    evidence: replyEvidence(input.text, c.summary, assembled),
    source: 'feedback',
    classifiedBy: c.classifiedBy,
    needsReview: c.needsReview,
    createdAt: new Date(),
  });
  await understandRepo.setCaseStatus(
    tx,
    caseId,
    c.confidence >= CLASSIFICATION.recommendationGate ? 'ready' : 'unclassified',
  );
  return { stored: 'reply_and_reason' as const, replyId: reply?.id ?? null };
}

export async function ingestReply(
  requestId: string,
  input: ReplyInput,
): Promise<{ stored: string; reasons: ClassificationView; classifiedBy: string }> {
  const prepared = await prepareReply(db, requestId, input.text);
  const result = await db.transaction((tx) => applyReply(tx, prepared, input));
  return {
    stored: result.stored,
    classifiedBy: prepared.classification.classifiedBy,
    reasons: await getReasonsWith(db, prepared.customerId),
  };
}

/* ----------------------------- Inbound feedback ----------------------------- */

export type InboundInput = {
  channel: InboundChannel;
  text: string;
  customerId?: string;
  region?: string;
};

/** Stores inbound feedback; returns a classification PREVIEW (does not change any case). */
export async function recordInbound(input: InboundInput) {
  let assembled: AssembledCase | null = null;
  let region = input.region ?? null;
  if (input.customerId) {
    const customer = await repo.findCustomer(db, input.customerId);
    if (!customer) throw notFound(`Customer ${input.customerId} not found`);
    region = region ?? customer.region;
    if (await repo.findOpenCaseId(db, input.customerId)) {
      assembled = await assembledCaseFor(db, input.customerId);
    }
  }
  const facts: ClassifierFacts = assembled
    ? factsFor(assembled)
    : {
        dropPct: 0,
        tenureMonths: 0,
        careContacts30d: 0,
        networkFaultReports30d: 0,
        activationsNow: 99,
      };
  const preview = await classifyFeedback(input.text, facts, await taxonomy(db));
  const feedback = await repo.insertFeedback(db, {
    id: randomUUID(),
    customerId: input.customerId ?? null,
    caseId: assembled?.row.caseId ?? null,
    feedbackRequestId: null,
    channel: input.channel,
    region,
    rawText: input.text,
    simulated: true,
    receivedAt: new Date(),
  });
  return {
    id: feedback?.id ?? null,
    channel: channelLabel(input.channel as Channel),
    channelId: input.channel,
    customerId: input.customerId ?? null,
    caseId: assembled?.row.caseId ?? null,
    region,
    preview: {
      reasonId: preview.reasonId,
      confidence: preview.confidence,
      sentiment: preview.sentiment,
      summary: preview.summary,
      classifiedBy: preview.classifiedBy,
    },
    note: 'Inbound feedback is stored as context; it does not change the case reason.',
  };
}

/* ------------------------------ Human override ------------------------------ */

export type OverrideInput = { reasonId: string; reviewerName: string; note?: string };

/**
 * A human confirms or corrects a classification. Confirming marks it reviewed; correcting
 * also adds a `human` classification, which becomes the case's reason everywhere.
 */
export async function applyOverride(
  tx: Transaction,
  classificationId: string,
  input: OverrideInput,
) {
  const found = await repo.findClassificationWithCustomer(tx, classificationId);
  if (!found) throw notFound(`Classification ${classificationId} not found`);
  const { classification: cls, customerId } = found;
  await understandRepo.lockCase(tx, cls.caseId);

  const reasons = new Map((await understandRepo.findReasons(tx)).map((r) => [r.id, r.label]));
  if (!reasons.has(input.reasonId)) throw notFound(`Unknown reason ${input.reasonId}`);

  const now = new Date();
  await repo.markReviewed(tx, cls.id, {
    reviewedReasonId: input.reasonId,
    reviewedBy: input.reviewerName,
    reviewedAt: now,
  });
  if (input.reasonId !== cls.reasonId) {
    await understandRepo.insertClassification(tx, {
      id: randomUUID(),
      caseId: cls.caseId,
      feedbackId: cls.feedbackId,
      reasonId: input.reasonId,
      confidence: 1,
      alternatives: [
        { reasonId: cls.reasonId, confidence: cls.confidence },
        ...cls.alternatives,
      ].filter((a) => a.reasonId !== input.reasonId),
      sentiment: cls.sentiment,
      summary: `Set by ${input.reviewerName}: ${reasons.get(input.reasonId)}${input.note ? `. ${input.note}` : ''}`,
      evidence: cls.evidence,
      source: 'human',
      classifiedBy: input.reviewerName,
      needsReview: false,
      reviewedReasonId: input.reasonId,
      reviewedBy: input.reviewerName,
      reviewedAt: now,
      createdAt: now,
    });
  }
  await understandRepo.setCaseStatus(tx, cls.caseId, 'ready');
  return customerId;
}

export async function overrideReason(classificationId: string, input: OverrideInput) {
  const customerId = await db.transaction((tx) => applyOverride(tx, classificationId, input));
  return getReasonsWith(db, customerId);
}
