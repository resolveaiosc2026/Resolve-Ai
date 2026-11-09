/**
 * Recommend: next-best-action engine. A faithful port of the prototype's
 * recommendAction / evaluateRule (frontend/lib/analytics.ts): same rules, same wording,
 * same ranking. Pure and deterministic; the LLM plays no part here.
 */
import { CLASSIFICATION, RECOMMEND } from '../../config/rules.js';
import type { EligibilityCheck, EligibilityRule } from '../../db/schema/json-types.js';

export type ActionDef = {
  id: string;
  name: string;
  shortName: string;
  price: number;
  currency: 'USD' | 'LRD';
  sizeMb: number;
  validityHours: number;
  reasons: string[];
  mismatchNote: string;
  channel: string;
  channelId: string;
  window: string;
  body: string;
  eligibility: EligibilityRule[];
};

export type CampaignDef = { reasonId: string; actionId: string; recoveryRate: number; n: number };

export type ReasonRef = { id: string; label: string; icon: string; confidence: number };

export type RecommendContext = {
  daysSinceLastActivity: number;
  region: string;
  careContacts30d: number;
  networkFaultReports30d: number;
  baselineActivations: number;
  /** Offers sent to this customer within the prior-offer window of the run date. */
  priorOffers: number;
};

export type ActionCandidate = {
  action: ActionDef;
  predictedRecovery: number;
  eligible: boolean;
  checks: EligibilityCheck[];
  why: string;
  rejectedReason: string | null;
};

export type HistoryRow = { reason: string; action: string; outcome: string };

export type Recommendation = {
  recommended: ActionCandidate | null;
  candidates: ActionCandidate[];
  notRecommended: ActionCandidate[];
  history: HistoryRow[];
};

export function evaluateRule(
  rule: EligibilityRule,
  ctx: RecommendContext,
  action: ActionDef,
  reason: ReasonRef | null,
): EligibilityCheck {
  const yes = (detail: string): EligibilityCheck => ({ ...rule, passed: true, detail });
  const no = (detail: string): EligibilityCheck => ({ ...rule, passed: false, detail });
  switch (rule.code) {
    case 'plan_active':
      return ctx.daysSinceLastActivity < RECOMMEND.inactivePlanDays
        ? yes(`Line active, last seen ${ctx.daysSinceLastActivity} days ago.`)
        : no('Line has had no activity for over 90 days.');
    case 'no_discount_30d':
      return ctx.priorOffers === 0
        ? yes('No offer sent to this customer in the last 30 days.')
        : no(`${ctx.priorOffers} offer(s) already sent in the last 30 days.`);
    case 'regional_stock':
      return (RECOMMEND.stockedRegions as readonly string[]).includes(ctx.region)
        ? yes(`${action.shortName} is stocked in ${ctx.region}.`)
        : no(`Not stocked in ${ctx.region}.`);
    case 'confidence_gate': {
      const conf = reason?.confidence ?? 0;
      return conf >= CLASSIFICATION.recommendationGate
        ? yes(`Reason confidence ${Math.round(conf * 100)}% clears the 80% threshold.`)
        : no(
            `Reason confidence ${Math.round(conf * 100)}% is below the 80% threshold — routed to human review.`,
          );
    }
    case 'affordability_cap':
      return action.price <= RECOMMEND.priceCapUsd
        ? yes(`$${action.price.toFixed(2)} is under the $2.00 pilot price cap.`)
        : no(`$${action.price.toFixed(2)} exceeds the pilot price cap.`);
    case 'fault_reported':
      return ctx.networkFaultReports30d > 0
        ? yes(`${ctx.networkFaultReports30d} fault report(s) in the last 30 days.`)
        : no('No network fault reported for this customer.');
    case 'prior_activation':
      return ctx.baselineActivations > 0
        ? yes('Customer has activated this bundle before.')
        : no('No activation history on record.');
    case 'pricing_approval':
      return no('Requires a pricing approval outside the pilot scope.');
    case 'consent_call':
      return ctx.careContacts30d >= RECOMMEND.consentCareContacts
        ? yes('Customer has spoken to care and agreed to a call back.')
        : no('No recorded consent to a care call.');
    default:
      return yes('Check passed.');
  }
}

export function recommend(
  actions: ActionDef[],
  campaigns: CampaignDef[],
  reasonLabels: Map<string, string>,
  ctx: RecommendContext,
  reason: ReasonRef | null,
): Recommendation {
  const candidates: ActionCandidate[] = actions.map((action) => {
    const campaign = campaigns.find(
      (c) => c.actionId === action.id && c.reasonId === (reason?.id ?? 'unknown'),
    );
    const checks = action.eligibility.map((rule) => evaluateRule(rule, ctx, action, reason));
    const allPassed = checks.every((c) => c.passed);
    const matchesReason = Boolean(reason) && action.reasons.includes(reason?.id ?? '');
    const mismatch = action.mismatchNote || 'Not built for this reason.';
    return {
      action,
      predictedRecovery: campaign?.recoveryRate ?? RECOMMEND.fallbackRecovery,
      eligible: allPassed && matchesReason,
      checks,
      why: matchesReason
        ? `Matches a ${reason?.label.toLowerCase()} reply: ${action.shortName.toLowerCase()} keeps the spend the customer is already making.`
        : mismatch,
      rejectedReason: !matchesReason
        ? mismatch
        : !allPassed
          ? (checks.find((c) => !c.passed)?.detail ?? 'Failed an eligibility check.')
          : null,
    };
  });

  const ranked = candidates
    .filter((c) => c.eligible)
    .sort((a, b) => b.predictedRecovery - a.predictedRecovery);

  return {
    recommended: ranked[0] ?? null,
    candidates: ranked,
    notRecommended: candidates.filter((c) => !c.eligible),
    history: campaigns.map((c) => ({
      reason: reasonLabels.get(c.reasonId) ?? 'Not classified',
      action: actions.find((a) => a.id === c.actionId)?.name ?? c.actionId,
      outcome: `${Math.round(c.recoveryRate * 100)}% recovered (n=${c.n}, synthetic)`,
    })),
  };
}

/** Prototype semantics: |sent − run| < N days (absolute difference). */
export function isPriorOffer(sentAt: Date, runAt: Date): boolean {
  return Math.abs(sentAt.getTime() - runAt.getTime()) / 86_400_000 < RECOMMEND.priorOfferDays;
}
