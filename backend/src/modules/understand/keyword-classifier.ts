/**
 * Understand: deterministic keyword classifier over the customer's own words,
 * blended with behavioural priors. Ported exactly from frontend/lib/analytics.ts
 * (classifyReason). Used for the seed now and as the LLM fallback in F5.
 */
import type { EvidenceItem, ReasonCandidate } from '../../db/schema/json-types.js';
import { round } from '../detect/scoring.js';

export type ReasonId =
  | 'affordability'
  | 'reduced_need'
  | 'competitor'
  | 'network_quality'
  | 'activation_difficulty'
  | 'unknown';

type ScoredReason = Exclude<ReasonId, 'unknown'>;

/** Floor keeps an unconsidered reason visible at a low share instead of 0%. */
const FLOOR = 0.45;

const LEXICON: Record<ScoredReason, Record<string, number>> = {
  affordability: {
    money: 6, hard: 5, price: 4, prices: 4, expensive: 4, cost: 3, cheap: 2,
    fees: 4, salary: 3, school: 2, small: 2, wait: 1, only: 1, finish: 2,
    weekly: 0.5, daily: 0.5, buy: 0.5,
  },
  reduced_need: {
    travel: 4, upcountry: 3, season: 2, seasonal: 3, work: 2, children: 3,
    grow: 2, need: 3, own: 1, their: 1, less: 2, finished: 1, here: 1,
  },
  competitor: {
    another: 3, other: 2, mtn: 5, airtel: 4, sim: 3, line: 2, office: 2,
    their: 1, switched: 4, network: 1,
  },
  network_quality: {
    network: 5, signal: 5, slow: 4, tower: 4, load: 2, area: 2, street: 1,
    inside: 1, drop: 2, off: 2, data: 1, no: 0.5,
  },
  activation_difficulty: {
    know: 3, how: 3, menu: 4, code: 3, dial: 3, press: 2, confuse: 5,
    ussd: 4, try: 2, many: 1, time: 1, want: 1,
  },
}; // prettier-ignore

const SCORED: ScoredReason[] = [
  'affordability',
  'reduced_need',
  'competitor',
  'network_quality',
  'activation_difficulty',
];

export type ClassifierFacts = {
  /** 0–1 usage drop share. */
  dropPct: number;
  tenureMonths: number;
  careContacts30d: number;
  networkFaultReports30d: number;
  activationsNow: number;
};

export type Classification = {
  primary: ReasonCandidate;
  alternatives: ReasonCandidate[];
};

function behaviouralPrior(id: ScoredReason, f: ClassifierFacts): number {
  switch (id) {
    case 'affordability':
      return f.dropPct >= 0.4 ? 1.5 : 0.4;
    case 'network_quality':
      return Math.min(4, f.networkFaultReports30d * 1.2);
    case 'reduced_need':
      return f.tenureMonths >= 36 ? 0.3 : 0;
    case 'activation_difficulty':
      return f.careContacts30d >= 3 ? 0.8 : 0;
    case 'competitor':
      return f.activationsNow <= 2 ? 0.5 : 0;
  }
}

/**
 * Scores every reason and normalizes to a distribution (sums to ~1).
 * `reasonOrder` is the taxonomy order; ties keep that order (stable sort).
 */
export function classifyText(
  text: string,
  facts: ClassifierFacts,
  reasonOrder: readonly ReasonId[],
): Classification {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9$']+/)
    .filter(Boolean);

  const raw = new Map<ReasonId, number>();
  for (const id of SCORED) {
    const dict = LEXICON[id];
    let score = FLOOR;
    for (const t of tokens) score += Object.hasOwn(dict, t) ? (dict[t] ?? 0) : 0;
    raw.set(id, score + behaviouralPrior(id, facts));
  }
  raw.set('unknown', FLOOR);

  const sum = [...raw.values()].reduce((s, v) => s + v, 0);
  const ranked = reasonOrder
    .map((reasonId) => ({ reasonId, confidence: round((raw.get(reasonId) ?? FLOOR) / sum, 3) }))
    .sort((a, b) => b.confidence - a.confidence);

  const [primary, ...alternatives] = ranked;
  if (!primary) throw new Error('Reason taxonomy is empty');
  return { primary, alternatives };
}

/** Evidence shown next to a classification (same wording as the prototype). */
export function classificationEvidence(input: {
  verbatim: string;
  activationsNow: number;
  baselineActivations: number;
  changePct: number;
  networkFaultReports30d: number;
  daysSinceLastActivity: number;
  region: string;
}): EvidenceItem[] {
  return [
    {
      kind: 'behavioural',
      title: "Behavioural signal — the customer's own words",
      body: `"${input.verbatim}" — cost language points to price pressure, and "small" points to buying in smaller sums.`,
    },
    {
      kind: 'usage',
      title: 'Usage pattern',
      body: `${input.activationsNow} bundle activations this month against their own baseline of ${input.baselineActivations} per month (${input.changePct}%).`,
    },
    {
      kind: 'exclusion',
      title: 'Network faults checked',
      body:
        input.networkFaultReports30d === 0
          ? `No fault reported from this customer in ${input.daysSinceLastActivity} days, and no fault logged in ${input.region}. Network quality is not supported by the evidence.`
          : `${input.networkFaultReports30d} fault report(s) from this customer in the last 30 days.`,
    },
  ];
}
