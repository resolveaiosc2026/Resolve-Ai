/** Copilot step 1: route a question to an intent with keyword rules (ported, same order). */

export const INTENTS = [
  'customer',
  'pilot',
  'population',
  'segment',
  'reasons',
  'action',
  'approvals',
  'trust',
  'unknown',
] as const;
export type Intent = (typeof INTENTS)[number];

export type ActionReason =
  'affordability' | 'network_quality' | 'activation_difficulty' | 'competitor' | 'reduced_need';

export type Route = { intent: Intent; customerId: string | null };

export const SUGGESTED_QUESTIONS = [
  'How many customers are at risk?',
  'Which segment needs the most attention?',
  'Why are customers disengaging?',
  'Is the pilot working?',
  'What should we do about affordability?',
  'Tell me about LR-20417',
] as const;

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/** The customer id mentioned in the question, if any (e.g. "lr-20417" → "LR-20417"). */
export function mentionedCustomer(question: string): string | null {
  return question.toUpperCase().match(/LR-\d+/)?.[0] ?? null;
}

/**
 * Routes a question. `customerKnown` tells whether the mentioned customer exists; as in the
 * prototype, an unknown id falls through to the other intents (and usually to a refusal).
 */
export function routeQuestion(question: string, customerKnown: boolean): Route {
  const q = question.toLowerCase().trim();
  const id = mentionedCustomer(question);

  if ((id && customerKnown) || (!id && has(q, 'this customer', 'customer 360'))) {
    return { intent: 'customer', customerId: id };
  }
  const route = (intent: Intent): Route => ({ intent, customerId: null });
  if (has(q, 'pilot', 'working', 'result', 'did it work', 'effect', 'lift', 'roi'))
    return route('pilot');
  if (has(q, 'how many', 'at risk', 'flagged', 'population', 'volume', 'size'))
    return route('population');
  if (has(q, 'segment', 'which group', 'worst', 'where should', 'focus', 'attention'))
    return route('segment');
  // "How confident are we in the reasons?" is about trust, not the distribution.
  if (
    !has(q, 'confiden', 'sure', 'accurate', 'trust', 'agree') &&
    has(q, 'why', 'reason', 'cause', 'disengag', 'leaving', 'churn')
  ) {
    return route('reasons');
  }
  if (
    has(q, 'what should we do', 'action', 'offer', 'affordab', 'network quality', 'recommend for')
  ) {
    return route('action');
  }
  if (has(q, 'approv', 'pending', 'queue', 'workload', 'how long', 'backlog'))
    return route('approvals');
  if (has(q, 'sure', 'confiden', 'accurate', 'trust', 'agree', 'verify', 'correct'))
    return route('trust');
  return route('unknown');
}

/** Which reason an "action" question is about (prototype rule; defaults to affordability). */
export function actionReason(question: string): ActionReason {
  const q = question.toLowerCase();
  if (q.includes('network')) return 'network_quality';
  if (q.includes('activation')) return 'activation_difficulty';
  if (q.includes('competitor')) return 'competitor';
  if (q.includes('need')) return 'reduced_need';
  return 'affordability';
}
