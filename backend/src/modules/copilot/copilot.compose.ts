/**
 * Copilot step 3: compose an answer from facts only (ported templates from the prototype's
 * copilot.ts: same wording, fact labels and values). Pure: no I/O, no model.
 */
import type { CopilotFact } from '../../db/schema/json-types.js';
import { SUGGESTED_QUESTIONS, type Intent } from './copilot.intents.js';

export type Composed = {
  intent: Intent;
  answer: string;
  facts: CopilotFact[];
  caveat?: string;
  followUps: string[];
};

const pct = (v: number) => Math.round(v * 100);
const num = (v: number) => v.toLocaleString('en-US');
const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];
/** Small counts as words ("three cases"), as the prototype writes them. */
const word = (v: number) => WORDS[v] ?? String(v);

export type CustomerFacts = {
  id: string;
  segment: string;
  region: string;
  tenureMonths: number;
  baselineGb: number;
  currentGb: number;
  changePct: number;
  priority: number;
  band: string;
  topDriver: string;
  reason: { label: string; confidence: number } | null;
  suggestedAction: string | null;
  sent: { count: number; firstDate: string } | null;
};

export function composeCustomer(f: CustomerFacts): Composed {
  return {
    intent: 'customer',
    answer:
      `${f.id} is a ${f.segment} in ${f.region}, ${f.tenureMonths} months on the network. Their bundle volume fell from ` +
      `${f.baselineGb.toFixed(1)} to ${f.currentGb.toFixed(1)} GB a month (${f.changePct}%), which is a priority score of ${f.priority}. ` +
      (f.reason
        ? `The likely reason is ${f.reason.label.toLowerCase()} at ${pct(f.reason.confidence)}% confidence, ` +
          `so ${f.suggestedAction ? `${f.suggestedAction} is suggested` : 'no action clears eligibility yet'}.`
        : 'There is no reply yet, so no reason is attached and nothing is suggested.'),
    facts: [
      {
        label: 'Baseline',
        value: `${f.baselineGb.toFixed(1)} GB / month`,
        source: 'customer_weekly_usage · usage summary',
      },
      {
        label: 'Last 4 weeks',
        value: `${f.currentGb.toFixed(1)} GB / month`,
        source: 'customer_weekly_usage · usage summary',
      },
      { label: 'Priority', value: `${f.priority} (${f.band})`, source: 'cases · priority score' },
      { label: 'Top score driver', value: f.topDriver, source: 'cases · priority contributions' },
      {
        label: 'Likely reason',
        value: f.reason ? `${f.reason.label} ${pct(f.reason.confidence)}%` : 'Awaiting reply',
        source: 'reason_classifications',
      },
      {
        label: 'Suggested action',
        value: f.suggestedAction ?? 'None yet',
        source: 'next-best-action engine',
      },
      {
        label: 'Action history',
        value: f.sent ? `${f.sent.count} sent ${f.sent.firstDate}` : 'None sent',
        source: 'interventions',
      },
    ],
    caveat: "The reason is a classification of the customer's own words, not a confirmed cause.",
    followUps: ['Is the pilot working?', 'What should we do about affordability?'],
  };
}

type Cohort = { recovered: number; n: number; rate: number; ci: { low: number; high: number } };
export type PilotFacts = {
  treated: Cohort;
  control: Cohort;
  differencePoints: number;
  intervalsOverlap: boolean;
  windowDays: number;
};

export function composePilot(f: PilotFacts): Composed {
  const ci = (c: Cohort) => `${c.recovered}/${c.n} (${pct(c.ci.low)}–${pct(c.ci.high)}%)`;
  return {
    intent: 'pilot',
    answer:
      `Too early to call. ${f.treated.recovered} of ${f.treated.n} treated customers recovered ` +
      `(${pct(f.treated.rate)}%), against ${f.control.recovered} of ${f.control.n} matched ` +
      `controls (${pct(f.control.rate)}%) — a difference of ${f.differencePoints} points. ` +
      (f.intervalsOverlap
        ? 'The 95% intervals overlap, so this pilot cannot separate a real effect from noise yet.'
        : 'The intervals do not overlap, but the sample is still too small for a budget decision.'),
    facts: [
      {
        label: 'Treated',
        value: ci(f.treated),
        source: 'outcomes (treated) · Wilson 95% interval',
      },
      {
        label: 'Control',
        value: ci(f.control),
        source: 'outcomes (control cohort) · Wilson 95% interval',
      },
      { label: 'Difference', value: `${f.differencePoints} points`, source: 'report summary' },
      {
        label: 'Pilot window',
        value: `${f.windowDays} days`,
        source: 'detection_runs · population summary',
      },
    ],
    caveat:
      'These recovery rates are simulated placeholders. Real churn validation needs Orange historical outcomes, which we do not have.',
    followUps: ['Why are customers disengaging?', 'How many customers are at risk?'],
  };
}

export type PopulationFacts = {
  runId: string;
  flagged: number;
  scored: number;
  highRisk: number;
  awaitingReply: number;
  readyForAction: number;
  pilotSample: number;
};

export function composePopulation(f: PopulationFacts): Composed {
  return {
    intent: 'population',
    answer:
      `${num(f.flagged)} subscribers were flagged in run ${f.runId}, ` +
      `out of ${num(f.scored)} scored. ${num(f.highRisk)} are high risk ` +
      `(priority 75 and above), ${num(f.awaitingReply)} are waiting on a reply, and ` +
      `${f.readyForAction} are ready for an action. The workbench reviews a ${f.pilotSample}-case pilot sample.`,
    facts: [
      { label: 'Scored', value: num(f.scored), source: 'detection_runs · population summary' },
      { label: 'Flagged', value: num(f.flagged), source: 'detection_runs · population summary' },
      { label: 'High risk', value: num(f.highRisk), source: 'detection_runs · risk bands' },
      {
        label: 'Awaiting reply',
        value: num(f.awaitingReply),
        source: 'detection_runs · population summary',
      },
      {
        label: 'Ready for action',
        value: String(f.readyForAction),
        source: 'detection_runs · population summary',
      },
    ],
    followUps: ['Which segment needs the most attention?', 'Is the pilot working?'],
  };
}

export type SegmentRow = { segment: string; n: number; mean: number; high: number };

/** Groups the priority queue (in queue order) and ranks segments by exposure. */
export function rankSegments(
  queue: { segment: string; priority: number; band: string }[],
): SegmentRow[] {
  const bySegment = new Map<string, { n: number; total: number; high: number }>();
  for (const r of queue) {
    const g = bySegment.get(r.segment) ?? { n: 0, total: 0, high: 0 };
    g.n++;
    g.total += r.priority;
    if (r.band === 'high') g.high++;
    bySegment.set(r.segment, g);
  }
  return [...bySegment.entries()]
    .filter(([, g]) => g.n >= 3)
    .map(([segment, g]) => ({ segment, n: g.n, mean: Math.round(g.total / g.n), high: g.high }))
    .sort((a, b) => b.high - a.high || b.mean - a.mean || b.n - a.n);
}

export function composeSegment(ranked: SegmentRow[], pilotSample: number): Composed {
  const top = ranked[0];
  const next = ranked[1];
  return {
    intent: 'segment',
    answer: top
      ? `${top.segment} needs the most attention: ${top.n} flagged cases, ${top.high} of them in the ` +
        `high-risk band, mean priority ${top.mean}. Next is ${next?.segment ?? '—'} with ` +
        `${next?.high ?? 0} high-risk cases. This ranks the ${pilotSample}-case pilot sample only, ` +
        `not the whole subscriber base.`
      : 'No segment has enough flagged cases to rank yet.',
    facts: ranked.slice(0, 4).map((s) => ({
      label: s.segment,
      value: `${s.n} cases · mean ${s.mean} · ${s.high} high`,
      source: 'priority queue · cases',
    })),
    caveat: `Mean priority is a sample statistic over ${pilotSample} pilot cases; segment sizes in production differ.`,
    followUps: ['Why are customers disengaging?', 'Tell me about LR-20417'],
  };
}

export type ReasonsFacts = {
  classified: number;
  awaitingReply: number;
  reasons: { label: string; count: number; pct: number }[];
};

export function composeReasons(f: ReasonsFacts): Composed {
  const top = f.reasons[0];
  return {
    intent: 'reasons',
    answer: top
      ? `Across the ${f.classified} cases with a customer reply, ${top.label.toLowerCase()} is the most common ` +
        `likely reason (${top.count} cases, ${top.pct}%). ${f.awaitingReply} cases have no reply yet, so they are ` +
        `counted separately rather than pushed into a reason. These are classifications of what customers wrote, ` +
        `not confirmed causes.`
      : `No case has a reason yet. ${f.awaitingReply} cases are waiting for the customer's own words.`,
    facts: f.reasons.map((r) => ({
      label: r.label,
      value: `${r.count} cases (${r.pct}%)`,
      source: 'reason_classifications',
    })),
    caveat: `${f.awaitingReply} unanswered cases stay unclassified. Silence is not evidence of a reason.`,
    followUps: ['What should we do about affordability?', 'Is the pilot working?'],
  };
}

export type ActionFacts = {
  reasonLabel: string;
  options: { shortName: string; name: string; rate: number; n: number }[];
  eligibleCount: number;
};

export function composeAction(f: ActionFacts): Composed {
  const best = f.options[0];
  return {
    intent: 'action',
    answer:
      `For ${f.reasonLabel.toLowerCase()}, the strongest option in campaign history is ` +
      `${best?.name ?? '—'} at ${pct(best?.rate ?? 0)}% expected recovery ` +
      `(n=${best?.n ?? 0}). ${f.eligibleCount} cases in the current queue carry this reason and clear eligibility, ` +
      `so each one still needs a named analyst to approve it before anything is sent.`,
    facts: f.options.map((o) => ({
      label: o.shortName,
      value: `${pct(o.rate)}% (n=${o.n})`,
      source: 'campaign_history',
    })),
    caveat:
      'Recovery rates are placeholders from simulated campaigns, not measured Orange campaign results.',
    followUps: ['How many customers are at risk?', 'Is the pilot working?'],
  };
}

export type ApprovalsFacts = {
  awaitingApproval: number;
  newInQueue: number;
  pilotSample: number;
  executed: number;
};

export function composeApprovals(f: ApprovalsFacts): Composed {
  return {
    intent: 'approvals',
    answer:
      `${f.awaitingApproval} actions are waiting for approval across the flagged population, ` +
      `and ${f.newInQueue} of the ${f.pilotSample} pilot cases are newly flagged and unopened. ` +
      `${f.executed} actions have already been approved and executed in this pilot. ` +
      `Nothing in Resolve AI sends without a human sign-off.`,
    facts: [
      {
        label: 'Awaiting approval',
        value: String(f.awaitingApproval),
        source: 'detection_runs · population summary',
      },
      { label: 'New in pilot queue', value: String(f.newInQueue), source: 'cases · queue status' },
      { label: 'Executed in pilot', value: String(f.executed), source: 'interventions' },
    ],
    followUps: ['Which segment needs the most attention?', 'Is the pilot working?'],
  };
}

export type TrustFacts = { reviewed: number; agreed: number; pct: number; belowGate: number };

export function composeTrust(f: TrustFacts): Composed {
  return {
    intent: 'trust',
    answer:
      `Analysts reviewed ${f.reviewed} classifications and agreed with ${f.agreed} ` +
      `(${f.pct}%). That is a sample of ${f.reviewed} cases, not an accuracy measure. ` +
      `${f.belowGate} classified cases in the queue sit below the 80% confidence gate, and those route to a human before ` +
      `any action is suggested.`,
    facts: [
      {
        label: 'Reviewed',
        value: `${f.reviewed} cases`,
        source: 'reason_classifications · human review',
      },
      {
        label: 'Agreed',
        value: `${f.agreed}/${f.reviewed}`,
        source: 'reason_classifications · human review',
      },
      {
        label: 'Below the gate',
        value: `${f.belowGate} cases`,
        source: 'reason_classifications · confidence < 0.8',
      },
    ],
    caveat: `Agreement on ${word(f.reviewed)} cases says the review loop exists. It does not say the classifier is accurate.`,
    followUps: ['Why are customers disengaging?', 'Tell me about LR-20417'],
  };
}

export function composeUnknown(pilotSample: number): Composed {
  return {
    intent: 'unknown',
    answer:
      'I only answer from the data loaded in this workbench, and I did not find a match for that question. ' +
      'I can talk about the flagged population, a segment, the likely reasons, an action for a reason, a single case, the pilot result, or the approval queue.',
    facts: [
      { label: 'Data in scope', value: 'Synthetic pilot dataset', source: 'Resolve AI database' },
      { label: 'Cases in scope', value: String(pilotSample), source: 'cases' },
    ],
    caveat:
      "Answers come only from Resolve AI's own aggregates; the copilot does not guess outside them.",
    followUps: SUGGESTED_QUESTIONS.slice(0, 4),
  };
}
