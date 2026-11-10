/**
 * Reply classification orchestration: LLM first (if configured), deterministic keyword
 * classifier as the fallback. The demo never depends on the AI being available.
 */
import { CLASSIFICATION } from '../../config/rules.js';
import { env } from '../../config/env.js';
import type { ReasonCandidate } from '../../db/schema/json-types.js';
import { logger } from '../../lib/logger.js';
import {
  classifyText,
  type ClassifierFacts,
  type ReasonId,
} from '../understand/keyword-classifier.js';
import type { LlmProvider, TaxonomyEntry } from './llm-provider.js';
import { OpenRouterProvider } from './openrouter.provider.js';

export type FeedbackClassificationResult = {
  reasonId: ReasonId;
  confidence: number;
  alternatives: ReasonCandidate[];
  sentiment: 'negative' | 'neutral' | 'positive' | null;
  summary: string;
  /** `llm:<model>` or `keyword_fallback`. */
  classifiedBy: string;
  needsReview: boolean;
};

let provider: LlmProvider | null | undefined;

/** The configured provider, or null when no API key is set. */
export function getLlmProvider(): LlmProvider | null {
  if (provider === undefined) {
    provider = env.OPENROUTER_API_KEY
      ? new OpenRouterProvider(
          env.OPENROUTER_API_KEY,
          env.OPENROUTER_MODEL,
          env.OPENROUTER_TIMEOUT_MS,
        )
      : null;
  }
  return provider;
}

/** Test/verification hook: force a provider (or none). */
export function setLlmProvider(p: LlmProvider | null): void {
  provider = p;
}

async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

export async function classifyFeedback(
  text: string,
  facts: ClassifierFacts,
  taxonomy: TaxonomyEntry[],
  options: { useLlm?: boolean } = {},
): Promise<FeedbackClassificationResult> {
  const order = taxonomy.map((t) => t.id as ReasonId);
  const keyword = classifyText(text, facts, order);
  const label = (id: string) => taxonomy.find((t) => t.id === id)?.label ?? id;
  const llm = options.useLlm === false ? null : getLlmProvider();

  if (llm) {
    try {
      const r = await withOneRetry(() => llm.classifyFeedback(text, taxonomy));
      return {
        reasonId: r.reasonId,
        confidence: Math.round(r.confidence * 1000) / 1000,
        // The keyword distribution supplies the "what else was considered" list.
        alternatives: [keyword.primary, ...keyword.alternatives].filter(
          (a) => a.reasonId !== r.reasonId,
        ),
        sentiment: r.sentiment,
        summary: r.summary,
        classifiedBy: llm.name,
        needsReview: r.confidence < CLASSIFICATION.reviewThreshold,
      };
    } catch (err) {
      // Never log the key or the customer's text; the reason is enough.
      logger.warn('LLM classification failed; using keyword fallback', {
        reason: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  const pct = Math.round(keyword.primary.confidence * 100);
  return {
    reasonId: keyword.primary.reasonId as ReasonId,
    confidence: keyword.primary.confidence,
    alternatives: keyword.alternatives,
    sentiment: null,
    summary: `The customer's reply points to ${label(keyword.primary.reasonId).toLowerCase()} (${pct}% confidence, keyword classifier).`,
    classifiedBy: 'keyword_fallback',
    needsReview: keyword.primary.confidence < CLASSIFICATION.reviewThreshold,
  };
}
