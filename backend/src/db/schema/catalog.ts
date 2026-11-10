import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { bundleValidityEnum, currencyEnum } from './enums.js';
import type { EligibilityRule } from './json-types.js';

/** Reason taxonomy (fixed list; `unknown` covers no evidence / no reply / low confidence). */
export const reasons = pgTable('reasons', {
  id: text().primaryKey(),
  label: text().notNull(),
  icon: text().notNull(),
  sortOrder: integer().notNull().default(0),
});

/** Data bundles customers buy, priced in USD or LRD. */
export const bundles = pgTable('bundles', {
  id: text().primaryKey(),
  name: text().notNull(),
  validity: bundleValidityEnum().notNull(),
  dataMb: integer().notNull(),
  price: numeric({ precision: 10, scale: 2, mode: 'number' }).notNull(),
  currency: currencyEnum().notNull(),
  isActive: boolean().notNull().default(true),
});

/** Next-best-action library (what Orange can offer or do for a given reason). */
export const actions = pgTable('actions', {
  id: text().primaryKey(),
  name: text().notNull(),
  shortName: text().notNull(),
  price: numeric({ precision: 10, scale: 2, mode: 'number' }).notNull().default(0),
  currency: currencyEnum().notNull().default('USD'),
  sizeMb: integer().notNull().default(0),
  validityHours: integer().notNull().default(0),
  channel: text().notNull(),
  deliveryWindow: text().notNull(),
  messageBody: text().notNull(),
  mismatchNote: text().notNull().default(''),
  eligibilityRules: jsonb()
    .$type<EligibilityRule[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Library order (the next-best-action engine breaks ties in this order). */
  sortOrder: integer().notNull().default(0),
});

/** Which reasons an action is built for. */
export const actionReasons = pgTable(
  'action_reasons',
  {
    actionId: text()
      .notNull()
      .references(() => actions.id, { onDelete: 'cascade' }),
    reasonId: text()
      .notNull()
      .references(() => reasons.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.actionId, t.reasonId] })],
);

/** Pre-pilot campaign results (synthetic) that drive predicted recovery per reason × action. */
export const campaignHistory = pgTable(
  'campaign_history',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    reasonId: text()
      .notNull()
      .references(() => reasons.id, { onDelete: 'restrict' }),
    actionId: text()
      .notNull()
      .references(() => actions.id, { onDelete: 'restrict' }),
    recoveryRate: numeric({ precision: 4, scale: 3, mode: 'number' }).notNull(),
    sampleSize: integer().notNull(),
    simulated: boolean().notNull().default(true),
  },
  (t) => [unique().on(t.reasonId, t.actionId)],
);
