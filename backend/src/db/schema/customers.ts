import { index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { bundles } from './catalog.js';
import { activationStatusEnum, currencyEnum, faultSourceEnum, valueTierEnum } from './enums.js';

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

/** Canonical customer reference (synthetic). Only a masked MSISDN is stored. */
export const customers = pgTable('customers', {
  id: text().primaryKey(), // e.g. LR-20417
  segment: text().notNull(),
  region: text().notNull(),
  valueTier: valueTierEnum().notNull(),
  tenureMonths: integer().notNull(),
  maskedMsisdn: text().notNull(),
  /** Synthetic scenario label used by the seed. Never shown as truth. */
  scenario: text(),
  createdAt: timestamptz().notNull().defaultNow(),
});

/** One row per bundle purchase attempt: the raw behavioral signal Detect works from. */
export const bundleActivations = pgTable(
  'bundle_activations',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: text()
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    bundleId: text()
      .notNull()
      .references(() => bundles.id, { onDelete: 'restrict' }),
    dataMb: integer().notNull(),
    pricePaid: numeric({ precision: 10, scale: 2, mode: 'number' }).notNull(),
    currency: currencyEnum().notNull(),
    activationChannel: text().notNull(), // ussd | app | agent
    status: activationStatusEnum().notNull(),
    activatedAt: timestamptz().notNull(),
  },
  (t) => [index('bundle_activations_customer_time_idx').on(t.customerId, t.activatedAt)],
);

/** Network fault reports (customer_id set) and regional incidents (customer_id null). */
export const networkFaults = pgTable(
  'network_faults',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: text().references(() => customers.id, { onDelete: 'restrict' }),
    region: text().notNull(),
    source: faultSourceEnum().notNull(),
    reportedAt: timestamptz().notNull(),
    resolvedAt: timestamptz(),
  },
  (t) => [
    index('network_faults_region_time_idx').on(t.region, t.reportedAt),
    index('network_faults_customer_idx').on(t.customerId),
  ],
);
