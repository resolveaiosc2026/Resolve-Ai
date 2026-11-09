/** Measure: deterministic outcome rule, demo scenario choice, timeline (ported from measureView). */
import { MEASURE } from '../../config/rules.js';

export type OutcomeType = 're_engaged' | 'partially_engaged' | 'no_change' | 'declined_further';
export type Scenario = 'recover' | 'partial' | 'no_change' | 'decline';

/** Share of the original drop recovered → outcome type (plan rule). */
export function measureOutcome(baseline: number, flagged: number, after: number) {
  const drop = baseline - flagged;
  const share =
    drop > 0
      ? (after - flagged) / drop
      : after >= baseline
        ? 1
        : (after - flagged) / Math.max(1, flagged);
  const outcomeType: OutcomeType =
    share >= MEASURE.reEngagedShare
      ? 're_engaged'
      : share >= MEASURE.partialShare
        ? 'partially_engaged'
        : share >= MEASURE.noChangeShare
          ? 'no_change'
          : 'declined_further';
  return {
    outcomeType,
    recovered: outcomeType === 're_engaged',
    share: Math.round(share * 1000) / 1000,
    changePct: baseline > 0 ? Math.round((after / baseline - 1) * 100) : 0,
  };
}

/** Purchases the simulation generates for a scenario. */
export function scenarioActivations(scenario: Scenario, baseline: number, flagged: number): number {
  switch (scenario) {
    case 'recover':
      return Math.round(baseline * 0.95);
    case 'partial':
      return Math.round(flagged + 0.3 * Math.max(0, baseline - flagged));
    case 'no_change':
      return flagged;
    case 'decline':
      return Math.round(flagged * 0.5);
  }
}

/**
 * Default demo scenario: a stable hash of the intervention reference compared with the
 * predicted recovery, so "recover" happens about as often as campaign history predicts.
 */
export function defaultScenario(reference: string, predictedRecovery: number): Scenario {
  let hash = 0;
  for (const ch of reference) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const u = (hash % 1000) / 1000;
  const rest = (1 - predictedRecovery) / 3;
  if (u < predictedRecovery) return 'recover';
  if (u < predictedRecovery + rest) return 'partial';
  if (u < predictedRecovery + 2 * rest) return 'no_change';
  return 'decline';
}

export type TimelineEvent = { label: string; detail: string; at: string; system: string };

export type TimelineInput = {
  segment: string;
  daysSinceLastActivity: number;
  flaggedAt: Date;
  feedback: {
    channel: string;
    askedAt: Date;
    repliedAt: Date | null;
    verbatim: string | null;
    classifiedAt: Date | null;
    classifiedBy: string | null;
    reasonLabel: string;
    smsChannel: boolean;
  } | null;
  intervention: {
    actionName: string;
    draftedAt: Date;
    approvedBy: string;
    approvedAt: Date;
    sentAt: Date | null;
    status: string;
    channel: string;
    clickRecorded: boolean;
  } | null;
  outcome: { recovered: boolean; windowDays: number; measuredAt: Date } | null;
};

/** Same events, wording and order as the prototype's measureView. */
export function buildTimeline(t: TimelineInput): TimelineEvent[] {
  const ev = (label: string, detail: string, at: Date, system: string): TimelineEvent => ({
    label,
    detail,
    at: at.toISOString(),
    system,
  });
  const events: TimelineEvent[] = [
    ev(
      'Case flagged by detection',
      `${t.segment}, ${t.daysSinceLastActivity} days inactive`,
      t.flaggedAt,
      'Behaviour analytics',
    ),
  ];
  const f = t.feedback;
  if (f) {
    events.push(
      ev('Ask sent to the customer', `${f.channel} free-text question`, f.askedAt, f.channel),
    );
    if (f.repliedAt) {
      events.push(
        ev(
          'Customer reply received',
          f.verbatim ? `"${f.verbatim}"` : 'Reply logged',
          f.repliedAt,
          f.smsChannel ? 'SMS inbox' : `${f.channel} inbox`,
        ),
      );
    }
    if (f.classifiedAt) {
      // The prototype's analyst-classified cases say "confirmed by a human"; automated
      // classifications (LLM / keyword fallback / rules) must not claim that.
      const automated = /^(llm:|keyword_fallback|rules:)/.test(f.classifiedBy ?? '');
      events.push(
        ev(
          'Reply classified',
          automated
            ? `${f.reasonLabel} — classified automatically (${f.classifiedBy})`
            : `${f.reasonLabel} — confirmed by a human`,
          f.classifiedAt,
          automated ? 'Reason classifier' : (f.classifiedBy ?? 'Retention analyst'),
        ),
      );
    }
  }
  const i = t.intervention;
  if (i) {
    events.push(ev('Next-best-action drafted', i.actionName, i.draftedAt, 'Next-best-action'));
    events.push(
      ev(
        'Action approved by a human',
        `Signed off by ${i.approvedBy}`,
        i.approvedAt,
        'Retention analyst',
      ),
    );
    if (i.sentAt) {
      const label =
        i.status === 'delivered'
          ? 'Intervention delivered'
          : i.status === 'failed'
            ? 'Intervention failed to deliver'
            : 'Intervention handed off to Orange';
      events.push(ev(label, i.channel, i.sentAt, i.channel));
      if (i.clickRecorded) {
        events.push(
          ev('Offer link recorded', 'Customer opened the offer', i.sentAt, 'Campaign tracking'),
        );
      }
    }
  }
  if (t.outcome) {
    events.push(
      ev(
        `Outcome recorded (${t.outcome.recovered ? 'recovered' : 'not recovered'})`,
        `${t.outcome.windowDays}-day window`,
        t.outcome.measuredAt,
        'Evaluation',
      ),
    );
  }
  return events;
}
