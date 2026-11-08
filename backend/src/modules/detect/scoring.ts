/**
 * Detect: pure, deterministic scoring. Ported from frontend/lib/analytics.ts
 * (usageView, priorityView, bandForScore) so stored figures match the UI exactly.
 */
import { CURRENCY, DETECTION, PRIORITY } from '../../config/rules.js';
import type { ScoreContribution } from '../../db/schema/json-types.js';

export type ValueTier = 'high' | 'medium' | 'low';
export type PriorityBand = 'high' | 'medium' | 'low';

const DAY_MS = 86_400_000;

/** Same rounding as the frontend: Math.round on a scaled value. */
export function round(value: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

export type UsageSummary = {
  baselineGb: number;
  currentGb: number;
  changePct: number;
  /** 0–1 share of the drop (0 when usage rose). */
  dropPct: number;
  bandLowGb: number;
  bandHighGb: number;
};

/** Baseline vs current usage, both per month, from weekly GB ordered oldest → newest. */
export function summarizeUsage(
  weeklyGb: number[],
  baselineWeeks: number = DETECTION.baselineWeeks,
): UsageSummary {
  const baselineGb = round(mean(weeklyGb.slice(0, baselineWeeks)) * DETECTION.weeksPerMonth, 1);
  const currentGb = round(mean(weeklyGb.slice(baselineWeeks)) * DETECTION.weeksPerMonth, 1);
  const changePct = Math.round((currentGb / baselineGb - 1) * 100);
  return {
    baselineGb,
    currentGb,
    changePct,
    dropPct: Math.max(0, -changePct) / 100,
    bandLowGb: round(baselineGb * (1 - DETECTION.normalBandPct), 2),
    bandHighGb: round(baselineGb * (1 + DETECTION.normalBandPct), 2),
  };
}

export type PriorityInput = {
  segment: string;
  valueTier: ValueTier;
  tenureMonths: number;
  daysSinceLastActivity: number;
  careContacts30d: number;
};

export type PriorityResult = {
  total: number;
  band: PriorityBand;
  contributions: ScoreContribution[];
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Five visible, capped contributions so an analyst can see what drove the score. */
export function scorePriority(customer: PriorityInput, usage: UsageSummary): PriorityResult {
  const p = PRIORITY;
  const drop = Math.min(p.drop.max, Math.round(usage.dropPct * 100 * p.drop.pointsPerPct));
  const tierPoints = p.valueTier[customer.valueTier];
  const tenure = Math.min(
    p.tenure.max,
    Math.round(customer.tenureMonths / p.tenure.monthsPerPoint),
  );
  const inactivity = Math.min(
    p.inactivity.max,
    Math.round(customer.daysSinceLastActivity / p.inactivity.daysPerPoint),
  );
  const care = Math.min(p.care.max, customer.careContacts30d * p.care.pointsPerContact);

  const contributions: ScoreContribution[] = [
    {
      key: 'drop',
      label: 'Usage drop',
      points: drop,
      max: p.drop.max,
      detail: `${usage.changePct}% against their own ${usage.baselineGb} GB baseline`,
    },
    {
      key: 'value',
      label: 'Value tier',
      points: tierPoints,
      max: p.valueTier.max,
      detail: `${customer.segment}, ${capitalize(customer.valueTier)} value tier`,
    },
    {
      key: 'tenure',
      label: 'Tenure',
      points: tenure,
      max: p.tenure.max,
      detail: `${customer.tenureMonths} months on the network`,
    },
    {
      key: 'inactivity',
      label: 'Days inactive',
      points: inactivity,
      max: p.inactivity.max,
      detail: `${customer.daysSinceLastActivity} days since last activity`,
    },
    {
      key: 'care',
      label: 'Recent care contact',
      points: care,
      max: p.care.max,
      detail:
        customer.careContacts30d === 0
          ? 'No care contact in the last 30 days'
          : `${customer.careContacts30d} care contacts in the last 30 days`,
    },
  ];

  const total = contributions.reduce((s, c) => s + c.points, 0);
  return { total, band: bandForScore(total), contributions };
}

export function bandForScore(score: number): PriorityBand {
  if (score >= PRIORITY.bands.high) return 'high';
  if (score >= PRIORITY.bands.medium) return 'medium';
  return 'low';
}

export type ActivationEvent = {
  activatedAt: Date;
  status: 'success' | 'failed';
  pricePaid: number;
  currency: 'USD' | 'LRD';
};

export type ActivationSummary = {
  /** Per-month figures (window total ÷ months). */
  activations: number;
  activeDays: number;
  spendUsd: number;
  spendLrd: number;
  spendUsdEquivalent: number;
  failedActivationRate: number;
  lastActivityAt: Date | null;
  daysSinceLastActivity: number;
};

/**
 * Summarizes purchases in the window (from, to], normalized per month.
 * `daysSinceLastActivity` is measured from `to` to the last successful purchase.
 */
export function summarizeActivations(
  events: ActivationEvent[],
  window: { from: Date; to: Date; months: number },
): ActivationSummary {
  const inWindow = events.filter((e) => e.activatedAt > window.from && e.activatedAt <= window.to);
  const ok = inWindow.filter((e) => e.status === 'success');
  const spendUsd = ok.filter((e) => e.currency === 'USD').reduce((s, e) => s + e.pricePaid, 0);
  const spendLrd = ok.filter((e) => e.currency === 'LRD').reduce((s, e) => s + e.pricePaid, 0);
  const activeDays = new Set(ok.map((e) => e.activatedAt.toISOString().slice(0, 10))).size;
  const lastActivityAt = ok.reduce<Date | null>(
    (last, e) => (!last || e.activatedAt > last ? e.activatedAt : last),
    null,
  );
  const m = window.months;

  return {
    activations: Math.round(ok.length / m),
    activeDays: Math.round(activeDays / m),
    spendUsd: round(spendUsd / m, 2),
    spendLrd: round(spendLrd / m, 2),
    spendUsdEquivalent: round((spendUsd + spendLrd / CURRENCY.lrdPerUsd) / m, 2),
    failedActivationRate: inWindow.length
      ? round((inWindow.length - ok.length) / inWindow.length, 3)
      : 0,
    lastActivityAt,
    daysSinceLastActivity: lastActivityAt
      ? Math.floor((window.to.getTime() - lastActivityAt.getTime()) / DAY_MS)
      : Math.round((window.to.getTime() - window.from.getTime()) / DAY_MS),
  };
}
