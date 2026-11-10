/**
 * LLM provider boundary. The LLM is NEVER the source of truth: it only maps a customer's
 * free text onto the fixed reason taxonomy and phrases a one-line summary. Its output is
 * untrusted and validated with Zod before use.
 */
import { z } from 'zod';

export const REASON_IDS = [
  'affordability',
  'reduced_need',
  'competitor',
  'network_quality',
  'activation_difficulty',
  'unknown',
] as const;

export const llmClassificationSchema = z.object({
  reasonId: z.enum(REASON_IDS),
  confidence: z.number().min(0).max(1),
  sentiment: z.enum(['negative', 'neutral', 'positive']),
  summary: z.string().trim().min(1).max(300),
});
export type LlmClassification = z.infer<typeof llmClassificationSchema>;

export type TaxonomyEntry = { id: string; label: string };

export interface LlmProvider {
  /** Identifier stored as `classified_by` (e.g. `llm:openai/gpt-4o-mini`). */
  readonly name: string;
  /** Receives ONLY the reply text and the taxonomy (no customer identifiers). */
  classifyFeedback(text: string, taxonomy: TaxonomyEntry[]): Promise<LlmClassification>;
  /** Generic JSON-mode chat call; the caller MUST validate the result with Zod. */
  completeJson(system: string, user: string): Promise<unknown>;
}
