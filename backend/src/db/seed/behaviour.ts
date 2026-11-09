/**
 * Behaviour rows: customers, weekly usage, bundle purchases, care contacts, fault reports.
 * Uses its OWN PRNG so the ported generator's random sequence is never disturbed.
 *
 * Purchases are generated so that the activation windows used by Detect reproduce the
 * prototype exactly: last 30 days = activations now; the 60 days before ÷ 2 = baseline;
 * the latest purchase is exactly `days_since_last_activity` days before the run.
 */
import type { ActivationEvent } from '../../modules/detect/scoring.js';
import type {
  bundleActivations,
  customers,
  customerWeeklyUsage,
  networkFaults,
} from '../schema/index.js';
import { BUNDLES } from './catalog.js';
import { ANCHOR_IDS, DAY_MS, RUN_DATE, type PilotDataset } from './pilot-dataset.js';
import { createRandom } from './prng.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export const BEHAVIOUR_SEED = 20261103;
const MINUTE_MS = 60_000;

/** Short, neutral synthetic care notes (deliberately not reason-revealing). */
const CARE_NOTES = [
  'Asked how to check the remaining data balance.',
  'Asked when the current bundle expires.',
  'Requested help with a recharge that did not show on the account.',
  'Asked how to stop automatic bundle renewal.',
  'Asked for the code to share data with another line.',
];

export type CustomerBehaviour = {
  weeklyGb: number[];
  events: ActivationEvent[];
  careContactTimes: Date[];
  faultReportTimes: Date[];
};

export type BehaviourRows = {
  customers: Row<typeof customers>[];
  weeklyUsage: Row<typeof customerWeeklyUsage>[];
  activations: Row<typeof bundleActivations>[];
  networkFaults: Row<typeof networkFaults>[];
  /** Care contacts become customer_feedback rows once case ids are known. */
  careContacts: { customerId: string; region: string; rawText: string; receivedAt: Date }[];
  byCustomer: Map<string, CustomerBehaviour>;
};

export function buildBehaviour(data: PilotDataset): BehaviourRows {
  const rnd = createRandom(BEHAVIOUR_SEED);
  const rows: BehaviourRows = {
    customers: [],
    weeklyUsage: [],
    activations: [],
    networkFaults: [],
    careContacts: [],
    byCustomer: new Map(),
  };

  const usdBundles = BUNDLES.filter((b) => b.currency === 'USD');
  const lrdBundles = BUNDLES.filter((b) => b.currency === 'LRD');
  const between = (from: number, to: number) => new Date(from + rnd.next() * (to - from));

  for (const c of data.customers) {
    const activity = data.activity[c.id];
    if (!activity) throw new Error(`No weekly activity for ${c.id}`);

    rows.customers.push({
      id: c.id,
      segment: c.segment,
      region: c.region,
      valueTier: c.value_tier.toLowerCase() as 'high' | 'medium' | 'low',
      tenureMonths: c.tenure_months,
      maskedMsisdn: c.masked_msisdn,
      scenario: ANCHOR_IDS.includes(c.id) ? 'pilot_anchor' : 'pilot_sample',
    });

    for (const w of activity.weeks) {
      rows.weeklyUsage.push({ customerId: c.id, weekStart: w.week_start, dataGb: w.gb });
    }

    // Purchase times: current window (run-30d, last], baseline window (run-90d, run-30d].
    const last = RUN_DATE - c.days_since_last_activity * DAY_MS;
    const currentStart = RUN_DATE - 30 * DAY_MS;
    const baselineStart = RUN_DATE - 90 * DAY_MS;
    const times: Date[] = [new Date(last)];
    for (let i = 1; i < c.activations_per_month_now; i++) {
      times.push(between(currentStart + MINUTE_MS, last));
    }
    for (let i = 0; i < c.baseline_activations_per_month * 2; i++) {
      times.push(between(baselineStart + MINUTE_MS, currentStart));
    }
    times.sort((a, b) => a.getTime() - b.getTime());

    const events: ActivationEvent[] = [];
    for (const activatedAt of times) {
      const bundle = rnd.pick(rnd.next() < 0.6 ? usdBundles : lrdBundles);
      const event: ActivationEvent = {
        activatedAt,
        status: 'success',
        pricePaid: bundle.price,
        currency: bundle.currency,
      };
      events.push(event);
      rows.activations.push({
        customerId: c.id,
        bundleId: bundle.id,
        dataMb: bundle.dataMb,
        pricePaid: bundle.price,
        currency: bundle.currency,
        activationChannel: rnd.pick(['ussd', 'ussd', 'app', 'agent']),
        status: 'success',
        activatedAt,
      });
    }

    const careContactTimes = Array.from({ length: c.care_contacts_30d }, () =>
      between(RUN_DATE - 29 * DAY_MS, RUN_DATE - DAY_MS),
    );
    for (const receivedAt of careContactTimes) {
      rows.careContacts.push({
        customerId: c.id,
        region: c.region,
        rawText: rnd.pick(CARE_NOTES),
        receivedAt,
      });
    }

    const faultReportTimes = Array.from({ length: c.network_fault_reports_30d }, () =>
      between(RUN_DATE - 29 * DAY_MS, RUN_DATE - DAY_MS),
    );
    for (const reportedAt of faultReportTimes) {
      rows.networkFaults.push({
        customerId: c.id,
        region: c.region,
        source: 'customer_report',
        reportedAt,
        resolvedAt: null,
      });
    }

    rows.byCustomer.set(c.id, {
      weeklyGb: activity.weeks.map((w) => w.gb),
      events,
      careContactTimes,
      faultReportTimes,
    });
  }

  addEvidenceScenarios(rows);
  return rows;
}

/**
 * Evidence scenarios for Understand (F4). Deterministic (no PRNG calls) and parity-safe:
 * failed attempts are not purchases, and a regional incident is not customer data, so
 * activation counts, days inactive and priorities stay identical to the prototype.
 */
export const EVIDENCE_SCENARIOS = {
  /** Repeated failed purchase attempts → activation_difficulty. */
  failedAttempts: {
    customerId: 'LR-14806',
    bundleId: 'daily_600mb_usd',
    daysBeforeRun: [10, 8, 6, 4],
  },
  /** Regional outage overlapping the current window → network_quality. */
  incident: { region: 'Ganta', reportedDaysBeforeRun: 12, resolvedDaysBeforeRun: 9 },
} as const;

function addEvidenceScenarios(rows: BehaviourRows): void {
  const { failedAttempts, incident } = EVIDENCE_SCENARIOS;
  const bundle = BUNDLES.find((b) => b.id === failedAttempts.bundleId);
  const behaviour = rows.byCustomer.get(failedAttempts.customerId);
  if (!bundle || !behaviour) throw new Error('Evidence scenario references unknown seed data');

  for (const days of failedAttempts.daysBeforeRun) {
    const activatedAt = new Date(RUN_DATE - days * DAY_MS + 2 * 3_600_000);
    rows.activations.push({
      customerId: failedAttempts.customerId,
      bundleId: bundle.id,
      dataMb: bundle.dataMb,
      pricePaid: bundle.price,
      currency: bundle.currency,
      activationChannel: 'ussd',
      status: 'failed',
      activatedAt,
    });
    behaviour.events.push({
      activatedAt,
      status: 'failed',
      pricePaid: bundle.price,
      currency: bundle.currency,
    });
  }

  rows.networkFaults.push({
    customerId: null,
    region: incident.region,
    source: 'network_monitoring',
    reportedAt: new Date(RUN_DATE - incident.reportedDaysBeforeRun * DAY_MS),
    resolvedAt: new Date(RUN_DATE - incident.resolvedDaysBeforeRun * DAY_MS),
  });
}
