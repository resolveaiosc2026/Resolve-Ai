/**
 * DTOs shaped like the frontend `ClassificationView` / `FeedbackEntry` / `ReasonCandidate`
 * (frontend/lib/types.ts), in camelCase, plus the evidence `assessment`.
 */
import { CHANNEL_LABELS, type Channel } from '../../config/rules.js';
import type {
  customerFeedback,
  feedbackRequests,
  reasonClassifications,
} from '../../db/schema/index.js';
import type { EvidenceItem } from '../../db/schema/json-types.js';
import type { EvidenceSignal, NextStep } from './evidence.compute.js';

type RequestRecord = typeof feedbackRequests.$inferSelect;
type ReplyRecord = typeof customerFeedback.$inferSelect;
type ClassificationRecord = typeof reasonClassifications.$inferSelect;

export type ReasonInfo = { id: string; label: string; icon: string };

export type ReasonCandidateView = ReasonInfo & { confidence: number };

export type FeedbackEntryView = {
  requestId: string;
  askedAt: string;
  channel: string;
  channelId: string;
  question: string;
  replyReceived: boolean;
  repliedAt: string | null;
  classifiedBy: string | null;
  classifiedAt: string | null;
  verbatim: string | null;
};

export type AssessmentView = {
  nextStep: NextStep;
  reasonKnown: boolean;
  signals: (EvidenceSignal & { label: string })[];
};

export type ClassificationView = {
  caseId: string;
  /** Id of the reason record (use with PATCH /reasons/:classificationId); null until a reason exists. */
  classificationId: string | null;
  status: 'classified' | 'awaiting_reply' | 'unclassified';
  primary: ReasonCandidateView | null;
  alternatives: ReasonCandidateView[];
  evidence: EvidenceItem[];
  feedback: FeedbackEntryView | null;
  source: ClassificationRecord['source'] | null;
  review: { reasonId: string; reviewedBy: string; reviewedAt: string } | null;
  assessment: AssessmentView;
};

export const channelLabel = (channel: string) => CHANNEL_LABELS[channel as Channel] ?? channel;

export function toCandidate(
  reasonId: string,
  confidence: number,
  reasons: Map<string, ReasonInfo>,
): ReasonCandidateView {
  const r = reasons.get(reasonId);
  return { id: reasonId, label: r?.label ?? reasonId, icon: r?.icon ?? 'question', confidence };
}

export function toFeedbackEntry(
  request: RequestRecord,
  reply: ReplyRecord | undefined,
  classification: ClassificationRecord | undefined,
): FeedbackEntryView {
  const fromReply = Boolean(classification && reply && classification.feedbackId === reply.id);
  return {
    requestId: request.id,
    askedAt: request.createdAt.toISOString(),
    channel: channelLabel(request.channel),
    channelId: request.channel,
    question: request.question,
    replyReceived: Boolean(reply),
    repliedAt: reply ? reply.receivedAt.toISOString() : null,
    classifiedBy: fromReply ? (classification?.classifiedBy ?? null) : null,
    classifiedAt: fromReply ? (classification?.createdAt.toISOString() ?? null) : null,
    verbatim: reply?.rawText ?? null,
  };
}
