/**
 * DTOs shaped like the frontend view models (frontend/lib/types.ts) in camelCase,
 * so the UI can swap its local analytics for API calls with minimal change.
 * Enum values are lowercase (`valueTier: "high"`); the UI capitalizes for display.
 */
import type { cases, customerMetrics, customers } from '../../db/schema/index.js';
import type { ScoreContribution } from '../../db/schema/json-types.js';
import type { WeeklyUsagePoint } from './detection.compute.js';
import type { PriorityBand, UsageSummary } from './scoring.js';

type CustomerRecord = typeof customers.$inferSelect;
type CaseRecord = typeof cases.$inferSelect;
type MetricRecord = typeof customerMetrics.$inferSelect;

export type CustomerView = {
  id: string;
  segment: string;
  region: string;
  valueTier: CustomerRecord['valueTier'];
  tenureMonths: number;
  maskedMsisdn: string;
  daysSinceLastActivity: number;
  careContacts30d: number;
  networkFaultReports30d: number;
  baselineActivationsPerMonth: number;
  activationsPerMonthNow: number;
  queueStatus: CaseRecord['queueStatus'];
  flaggedAt: string;
};

export type UsageView = UsageSummary & {
  weeks: WeeklyUsagePoint[];
  baselineActivations: number;
  currentActivations: number;
};

export type PriorityView = {
  total: number;
  band: PriorityBand;
  contributions: ScoreContribution[];
};

export type QueueRow = {
  caseId: string;
  customer: CustomerView;
  usage: UsageView;
  priority: PriorityView;
  status: CaseRecord['queueStatus'];
  reasonLabel: string;
};

export type MetricsView = {
  activations: number;
  dataGb: number;
  spendUsd: number;
  spendLrd: number;
  spendUsdEquivalent: number;
  activeDays: number;
  failedActivationRate: number;
  daysSinceLastActivity: number;
};

export type CaseMetrics = { baseline?: MetricRecord; current?: MetricRecord };

export function toCustomerView(
  customer: CustomerRecord,
  kase: CaseRecord,
  metrics: CaseMetrics,
): CustomerView {
  return {
    id: customer.id,
    segment: customer.segment,
    region: customer.region,
    valueTier: customer.valueTier,
    tenureMonths: customer.tenureMonths,
    maskedMsisdn: customer.maskedMsisdn,
    daysSinceLastActivity: metrics.current?.daysSinceLastActivity ?? 0,
    careContacts30d: metrics.current?.careContacts30d ?? 0,
    networkFaultReports30d: metrics.current?.networkFaultReports30d ?? 0,
    baselineActivationsPerMonth: metrics.baseline?.activations ?? 0,
    activationsPerMonthNow: metrics.current?.activations ?? 0,
    queueStatus: kase.queueStatus,
    flaggedAt: kase.flaggedAt.toISOString(),
  };
}

export function toUsageView(
  weeks: WeeklyUsagePoint[],
  usage: UsageSummary,
  metrics: CaseMetrics,
): UsageView {
  return {
    weeks,
    ...usage,
    baselineActivations: metrics.baseline?.activations ?? 0,
    currentActivations: metrics.current?.activations ?? 0,
  };
}

export function toPriorityView(kase: CaseRecord): PriorityView {
  return { total: kase.priorityScore, band: kase.priorityBand, contributions: kase.contributions };
}

export function toMetricsView(m: MetricRecord | undefined): MetricsView | null {
  if (!m) return null;
  return {
    activations: m.activations,
    dataGb: m.dataGb,
    spendUsd: m.spendUsd,
    spendLrd: m.spendLrd,
    spendUsdEquivalent: m.spendUsdEquivalent,
    activeDays: m.activeDays,
    failedActivationRate: m.failedActivationRate,
    daysSinceLastActivity: m.daysSinceLastActivity,
  };
}
