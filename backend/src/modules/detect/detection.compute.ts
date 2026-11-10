/**
 * Detect: turns one customer's raw signals into metrics, a flag and a priority score.
 * Pure and deterministic: used by the live detection service AND the seed, so the
 * database and the API can never disagree.
 */
import { DETECTION } from '../../config/rules.js';
import type { customerMetrics } from '../../db/schema/index.js';
import {
  scorePriority,
  summarizeActivations,
  summarizeUsage,
  type ActivationEvent,
  type ActivationSummary,
  type PriorityResult,
  type UsageSummary,
  type ValueTier,
} from './scoring.js';

const DAY_MS = 86_400_000;

export type WeeklyUsagePoint = { weekStart: string; gb: number };

export type CustomerSignals = {
  customerId: string;
  segment: string;
  valueTier: ValueTier;
  tenureMonths: number;
  /** Any order; filtered to weeks starting on or before `asOf`. */
  weekly: WeeklyUsagePoint[];
  /** Purchases in the activation windows (older ones are ignored). */
  events: ActivationEvent[];
  /** Last successful purchase on or before `asOf`, even if older than the windows. */
  lastActivityAt: Date | null;
  careContactTimes: Date[];
  faultReportTimes: Date[];
};

export type CustomerDetection = {
  customerId: string;
  /** The weekly points used (oldest → newest, at most baseline + current weeks). */
  weeks: WeeklyUsagePoint[];
  usage: UsageSummary;
  baseline: ActivationSummary;
  current: ActivationSummary;
  daysSinceLastActivity: number;
  careContacts30d: number;
  networkFaultReports30d: number;
  priority: PriorityResult;
  flagged: boolean;
};

export type DetectionWindows = {
  asOf: Date;
  currentFrom: Date;
  baselineFrom: Date;
  signalFrom: Date;
};

export function detectionWindows(asOf: Date): DetectionWindows {
  const currentFrom = new Date(asOf.getTime() - DETECTION.activationCurrentDays * DAY_MS);
  return {
    asOf,
    currentFrom,
    baselineFrom: new Date(currentFrom.getTime() - DETECTION.activationBaselineDays * DAY_MS),
    signalFrom: new Date(asOf.getTime() - DETECTION.signalWindowDays * DAY_MS),
  };
}

const inWindow = (t: Date, from: Date, to: Date) => t > from && t <= to;

/** The weeks detection looks at: the latest baseline + current weeks starting on or before `asOf`. */
export function windowWeeks(weekly: WeeklyUsagePoint[], asOf: Date): WeeklyUsagePoint[] {
  const asOfDay = asOf.toISOString().slice(0, 10);
  return weekly
    .filter((p) => p.weekStart <= asOfDay)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-(DETECTION.baselineWeeks + DETECTION.currentWeeks));
}

/** Usage summary over the window; tolerates a short history (fewer than 12 weeks). */
export function windowUsage(weeks: WeeklyUsagePoint[]): UsageSummary {
  const full = weeks.length === DETECTION.baselineWeeks + DETECTION.currentWeeks;
  return summarizeUsage(
    weeks.map((p) => p.gb),
    full ? DETECTION.baselineWeeks : Math.max(1, weeks.length - DETECTION.currentWeeks),
  );
}

export function detectCustomer(s: CustomerSignals, asOf: Date): CustomerDetection {
  const w = detectionWindows(asOf);
  const weeks = windowWeeks(s.weekly, asOf);
  const fullWindow = weeks.length === DETECTION.baselineWeeks + DETECTION.currentWeeks;
  const usage = windowUsage(weeks);

  const baseline = summarizeActivations(s.events, {
    from: w.baselineFrom,
    to: w.currentFrom,
    months: DETECTION.activationBaselineDays / DETECTION.activationCurrentDays,
  });
  const current = summarizeActivations(s.events, { from: w.currentFrom, to: asOf, months: 1 });

  const daysSinceLastActivity = s.lastActivityAt
    ? Math.floor((asOf.getTime() - s.lastActivityAt.getTime()) / DAY_MS)
    : current.daysSinceLastActivity;
  const careContacts30d = s.careContactTimes.filter((t) => inWindow(t, w.signalFrom, asOf)).length;
  const networkFaultReports30d = s.faultReportTimes.filter((t) =>
    inWindow(t, w.signalFrom, asOf),
  ).length;

  const priority = scorePriority(
    {
      segment: s.segment,
      valueTier: s.valueTier,
      tenureMonths: s.tenureMonths,
      daysSinceLastActivity,
      careContacts30d,
    },
    usage,
  );

  return {
    customerId: s.customerId,
    weeks,
    usage,
    baseline,
    current: { ...current, daysSinceLastActivity },
    daysSinceLastActivity,
    careContacts30d,
    networkFaultReports30d,
    priority,
    flagged: fullWindow && usage.changePct <= DETECTION.flagThresholdPct,
  };
}

type MetricRow = (typeof customerMetrics)['$inferInsert'];

/** Baseline + current `customer_metrics` rows (per-month figures) for one detection. */
export function toMetricRows(runId: string, d: CustomerDetection): MetricRow[] {
  const row = (
    period: 'baseline' | 'current',
    a: ActivationSummary,
    dataGb: number,
    signals: { care: number; faults: number },
  ): MetricRow => ({
    runId,
    customerId: d.customerId,
    period,
    activations: a.activations,
    dataGb,
    spendUsd: a.spendUsd,
    spendLrd: a.spendLrd,
    spendUsdEquivalent: a.spendUsdEquivalent,
    activeDays: a.activeDays,
    failedActivationRate: a.failedActivationRate,
    daysSinceLastActivity: a.daysSinceLastActivity,
    careContacts30d: signals.care,
    networkFaultReports30d: signals.faults,
  });
  return [
    row('baseline', d.baseline, d.usage.baselineGb, { care: 0, faults: 0 }),
    row('current', d.current, d.usage.currentGb, {
      care: d.careContacts30d,
      faults: d.networkFaultReports30d,
    }),
  ];
}
