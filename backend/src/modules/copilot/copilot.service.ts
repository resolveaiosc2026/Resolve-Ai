/**
 * Executive Copilot: route → load facts from backend aggregates → compose → (optionally)
 * phrase with the LLM under a numeric grounding guard → store the turn.
 */
import { randomUUID } from 'node:crypto';

import { db, type Executor } from '../../db/client.js';
import type { aiConversations } from '../../db/schema/index.js';
import { notFound } from '../../lib/http-error.js';
import type { Composed } from './copilot.compose.js';
import * as facts from './copilot.facts.js';
import {
  actionReason,
  mentionedCustomer,
  routeQuestion,
  SUGGESTED_QUESTIONS,
  type Route,
} from './copilot.intents.js';
import { llmPhrase, llmRoute } from './copilot.llm.js';
import * as repo from './copilot.repository.js';

export type AskInput = {
  question: string;
  conversationId?: string;
  style?: 'natural' | 'template';
};

export type AskOptions = { useLlm?: boolean; executor?: Executor };

type Turn = typeof aiConversations.$inferSelect;

function toDto(t: Turn) {
  return {
    id: t.id,
    conversationId: t.conversationId,
    question: t.question,
    intent: t.intent,
    routedBy: t.routedBy,
    answer: t.answer,
    draftAnswer: t.draftAnswer,
    phrasedBy: t.phrasedBy,
    facts: t.facts,
    caveat: t.caveat,
    followUps: t.followUps,
    createdAt: t.createdAt.toISOString(),
  };
}

async function resolveRoute(question: string, useLlm: boolean) {
  const id = mentionedCustomer(question);
  const known = id ? await facts.customerExists(id) : false;
  const byKeywords = routeQuestion(question, known);
  if (byKeywords.intent !== 'unknown' || !useLlm) {
    return { route: byKeywords, routedBy: 'keywords' as const };
  }
  const byLlm = await llmRoute(question);
  if (!byLlm || byLlm.intent === 'unknown')
    return { route: byKeywords, routedBy: 'keywords' as const };
  // A customer the LLM names must exist; otherwise refuse rather than guess.
  if (
    byLlm.intent === 'customer' &&
    byLlm.customerId &&
    !(await facts.customerExists(byLlm.customerId))
  ) {
    return { route: byKeywords, routedBy: 'keywords' as const };
  }
  return { route: byLlm, routedBy: 'llm' as const };
}

function compose(route: Route, question: string): Promise<Composed> {
  switch (route.intent) {
    case 'customer':
      return facts.customerAnswer(route.customerId);
    case 'pilot':
      return facts.pilotAnswer();
    case 'population':
      return facts.populationAnswer();
    case 'segment':
      return facts.segmentAnswer();
    case 'reasons':
      return facts.reasonsAnswer();
    case 'action':
      return facts.actionAnswer(actionReason(question));
    case 'approvals':
      return facts.approvalsAnswer();
    case 'trust':
      return facts.trustAnswer();
    case 'unknown':
      return facts.unknownAnswer();
  }
}

export async function ask(input: AskInput, options: AskOptions = {}) {
  const ex = options.executor ?? db;
  if (input.conversationId && !(await repo.findThread(ex, input.conversationId)).length) {
    throw notFound(`Conversation ${input.conversationId} not found`);
  }
  const useLlm = options.useLlm !== false;
  const question = input.question.trim();

  const { route, routedBy } = await resolveRoute(question, useLlm);
  const composed = await compose(route, question);
  const phrased =
    useLlm && input.style !== 'template'
      ? await llmPhrase(question, composed.answer, composed.facts, composed.caveat)
      : null;

  const turn = await repo.insertTurn(ex, {
    id: randomUUID(),
    conversationId: input.conversationId ?? randomUUID(),
    question,
    intent: composed.intent,
    routedBy,
    facts: composed.facts,
    draftAnswer: composed.answer,
    answer: phrased?.answer ?? composed.answer,
    phrasedBy: phrased?.model ?? 'template',
    caveat: composed.caveat ?? null,
    followUps: composed.followUps,
    createdAt: new Date(),
  });
  if (!turn) throw new Error('Copilot turn was not stored');
  return toDto(turn);
}

export function suggestions() {
  return [...SUGGESTED_QUESTIONS];
}

export async function getConversation(conversationId: string) {
  const turns = await repo.findThread(db, conversationId);
  if (!turns.length) throw notFound(`Conversation ${conversationId} not found`);
  return { conversationId, turns: turns.map(toDto) };
}
