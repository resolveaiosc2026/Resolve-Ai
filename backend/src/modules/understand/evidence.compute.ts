/**
 * Understand: deterministic behavioural evidence and the "Reason known?" decision.
 * Pure functions; thresholds live in config/rules.ts (EVIDENCE).
 */
import { CLASSIFICATION, EVIDENCE } from '../../config/rules.js';
import type { EvidenceItem } from '../../db/schema/json-types.js';
import type { PriorityBand } from '../detect/scoring.js';
import type { ReasonId } from './keyword-classifier.js';

export type EvidenceInput = {
  region: string;
  /** Purchase attempts in the current 30-day window. */
  failedAttempts: number;
  totalAttempts: number;
  ownFaultReports30d: number;
  /** A regional incident in the customer's region that overlaps the window, if any. */
  regionalIncident: { reportedAt: Date } | null;
  /** Average price per successful bundle (USD-equivalent), per window. */
  avgPriceUsdEqBaseline: number | null;
  avgPriceUsdEqCurrent: number | null;
};

export type EvidenceSignal = { reasonId: ReasonId; strength: number; detail: string };

export type NextStep =
  'classified' | 'use_evidence' | 'awaiting_reply' | 'request_feedback' | 'monitor';

const pct = (v: number) => Math.round(v * 100);
const usd = (v: number) => `$${v.toFixed(2)}`;
const day = (d: Date) => d.toISOString().slice(0, 10);

function activationSignal(i: EvidenceInput): EvidenceSignal | null {
  const rate = i.totalAttempts ? i.failedAttempts / i.totalAttempts : 0;
  const { strong, medium } = EVIDENCE.activation;
  const detail = `${i.failedAttempts} failed bundle purchase attempts in the last 30 days (${pct(rate)}% of attempts).`;
  if (i.failedAttempts >= strong.minFailed && rate >= strong.minFailedRate) {
    return { reasonId: 'activation_difficulty', strength: strong.strength, detail };
  }
  if (i.failedAttempts >= medium.minFailed) {
    return { reasonId: 'activation_difficulty', strength: medium.strength, detail };
  }
  return null;
}

function networkSignal(i: EvidenceInput): EvidenceSignal | null {
  const n = EVIDENCE.network;
  const reports = i.ownFaultReports30d;
  const reportText = `${reports} network fault report${reports === 1 ? '' : 's'} from this customer in the last 30 days`;
  if (i.regionalIncident && reports >= 1) {
    return {
      reasonId: 'network_quality',
      strength: n.incidentAndReport,
      detail: `Network incident in ${i.region} (reported ${day(i.regionalIncident.reportedAt)}) overlaps the drop, and ${reportText}.`,
    };
  }
  if (i.regionalIncident) {
    return {
      reasonId: 'network_quality',
      strength: n.incidentOrReports,
      detail: `Network incident in ${i.region} (reported ${day(i.regionalIncident.reportedAt)}) overlaps the drop; no fault reported by this customer.`,
    };
  }
  if (reports >= n.manyReports) {
    return { reasonId: 'network_quality', strength: n.incidentOrReports, detail: `${reportText}.` };
  }
  if (reports === 1) {
    return { reasonId: 'network_quality', strength: n.singleReport, detail: `${reportText}.` };
  }
  return null;
}

function affordabilitySignal(i: EvidenceInput): EvidenceSignal | null {
  const { avgPriceUsdEqBaseline: before, avgPriceUsdEqCurrent: now } = i;
  if (!before || now === null || now > before * EVIDENCE.affordability.tradeDownRatio) return null;
  return {
    reasonId: 'affordability',
    strength: EVIDENCE.affordability.strength,
    detail: `Average price per bundle fell from ${usd(before)} to ${usd(now)} (USD-equivalent): the customer is trading down to cheaper bundles.`,
  };
}

/** All evidence signals for a case, strongest first. */
export function evaluateEvidence(input: EvidenceInput): EvidenceSignal[] {
  return [activationSignal(input), networkSignal(input), affordabilitySignal(input)]
    .filter((s): s is EvidenceSignal => s !== null)
    .sort((a, b) => b.strength - a.strength);
}

/** True when evidence alone is enough to know the reason (same gate as recommendations). */
export function isStrong(signal: EvidenceSignal | undefined): boolean {
  return Boolean(signal && signal.strength >= CLASSIFICATION.recommendationGate);
}

/** The "Reason known?" decision. */
export function decideNextStep(input: {
  hasClassification: boolean;
  strongest: EvidenceSignal | undefined;
  hasOpenRequest: boolean;
  band: PriorityBand;
}): NextStep {
  if (input.hasClassification) return 'classified';
  if (isStrong(input.strongest)) return 'use_evidence';
  if (input.hasOpenRequest) return 'awaiting_reply';
  if (input.band !== 'low') return 'request_feedback';
  return 'monitor';
}

/** Evidence shown while a case has no reason yet (same wording as the prototype's usageEvidence). */
export function awaitingEvidence(input: {
  activationsNow: number;
  baselineActivations: number;
  changePct: number;
  networkFaultReports30d: number;
  region: string;
}): EvidenceItem[] {
  return [
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
          ? `No fault reported in ${input.region} for this customer. Network quality is not supported by the evidence.`
          : `${input.networkFaultReports30d} fault report(s) in the last 30 days.`,
    },
    {
      kind: 'behavioural',
      title: "Awaiting the customer's own words",
      body: 'No reply yet, so no reason is attached. The case stays in the queue rather than being guessed.',
    },
  ];
}

/** Evidence items stored with a classification that came from behavioural evidence. */
export function evidenceItems(
  signals: EvidenceSignal[],
  label: (id: ReasonId) => string,
): EvidenceItem[] {
  return signals.map((s) => ({
    kind: 'behavioural' as const,
    title: `${label(s.reasonId)}: ${pct(s.strength)}% strength`,
    body: s.detail,
  }));
}
