import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers } from './customers.js';
import { metricPeriodEnum, priorityBandEnum, queueStatusEnum } from './enums.js';
import type { PopulationSummary, ScoreContribution } from './json-types.js';

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

/** One execution of detection (baseline vs current comparison across customers). */
export const detectionRuns = pgTable('detection_runs', {
  id: text().primaryKey(), // e.g. RUN-2026-10-28-01
  runAt: timestamptz().notNull(),
  baselineWeeks: integer().notNull().default(8),
  currentWeeks: integer().notNull().default(4),
  modelVersion: text().notNull().default('rules-v1'),
  populationSummary: jsonb().$type<PopulationSummary>(),
  note: text(),
});

/** Aggregated behavior per customer, per run, per period (derived from bundle activations). */
export const customerMetrics = pgTable(
  'customer_metrics',
  {
    runId: text()
      .notNull()
      .references(() => detectionRuns.id, { onDelete: 'cascade' }),
    customerId: text()
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    period: metricPeriodEnum().notNull(),
    activations: integer().notNull(),
    dataGb: numeric({ precision: 8, scale: 2, mode: 'number' }).notNull(),
    spendUsd: numeric({ precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    spendLrd: numeric({ precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
    spendUsdEquivalent: numeric({ precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    activeDays: integer().notNull(),
    failedActivationRate: numeric({ precision: 4, scale: 3, mode: 'number' }).notNull().default(0),
    daysSinceLastActivity: integer().notNull(),
    // Explicit names: automatic snake_case would produce `care_contacts30d`.
    careContacts30d: integer('care_contacts_30d').notNull().default(0),
    networkFaultReports30d: integer('network_fault_reports_30d').notNull().default(0),
    calculatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.customerId, t.period] })],
);

/** A detection episode for one customer: the record every later step hangs off. */
export const cases = pgTable(
  'cases',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: text()
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    runId: text()
      .notNull()
      .references(() => detectionRuns.id, { onDelete: 'restrict' }),
    flaggedAt: timestamptz().notNull(),
    changePct: integer().notNull(),
    priorityScore: integer().notNull(),
    priorityBand: priorityBandEnum().notNull(),
    contributions: jsonb().$type<ScoreContribution[]>().notNull(),
    modelVersion: text().notNull().default('rules-v1'),
    queueStatus: queueStatusEnum().notNull().default('new'),
    closedAt: timestamptz(),
  },
  (t) => [
    index('cases_queue_priority_idx').on(t.queueStatus, t.priorityScore),
    index('cases_customer_idx').on(t.customerId),
  ],
);
