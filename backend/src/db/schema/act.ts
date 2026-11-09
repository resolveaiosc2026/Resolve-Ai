import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { actions } from './catalog.js';
import { cases } from './detect.js';
import {
  interventionStatusEnum,
  outcomeCohortEnum,
  outcomeTypeEnum,
  recommendationStatusEnum,
} from './enums.js';
import type { ActionAlternative, EligibilityCheck } from './json-types.js';
import { reasonClassifications } from './understand.js';

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

/** Recommend: the chosen next-best action for a case, with what else was considered. */
export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid().primaryKey().defaultRandom(),
    caseId: uuid()
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    classificationId: uuid().references(() => reasonClassifications.id, {
      onDelete: 'restrict',
    }),
    actionId: text()
      .notNull()
      .references(() => actions.id, { onDelete: 'restrict' }),
    predictedRecovery: numeric({ precision: 4, scale: 3, mode: 'number' }).notNull(),
    rationale: text().notNull(),
    objective: text().notNull(),
    eligibilityChecks: jsonb().$type<EligibilityCheck[]>().notNull(),
    alternatives: jsonb().$type<ActionAlternative[]>().notNull(),
    status: recommendationStatusEnum().notNull().default('pending'),
    decidedBy: text(),
    decidedAt: timestamptz(),
    decisionNote: text(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index('recommendations_case_idx').on(t.caseId),
    index('recommendations_status_idx').on(t.status),
  ],
);

/** Act: an approved recommendation handed off to Orange's existing workflow. */
export const interventions = pgTable(
  'interventions',
  {
    id: uuid().primaryKey().defaultRandom(),
    reference: text().notNull().unique(), // e.g. INT-4100
    recommendationId: uuid()
      .notNull()
      .unique()
      .references(() => recommendations.id, { onDelete: 'restrict' }),
    caseId: uuid()
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    actionId: text()
      .notNull()
      .references(() => actions.id, { onDelete: 'restrict' }),
    channel: text().notNull(),
    approvedBy: text().notNull(),
    approvedAt: timestamptz().notNull(),
    status: interventionStatusEnum().notNull().default('approved'),
    handedOffAt: timestamptz(),
    deliveredAt: timestamptz(),
    clickRecorded: boolean().notNull().default(false),
    note: text(),
    /** Send window chosen by the analyst (e.g. "Today 16:00–18:00"). */
    deliveryWindow: text(),
    /** Demo only: the simulation generated post-intervention activity up to this time. */
    simulatedThrough: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [index('interventions_case_idx').on(t.caseId)],
);

/** Measure: result after the window, for treated cases and the matched control cohort. */
export const outcomes = pgTable(
  'outcomes',
  {
    id: uuid().primaryKey().defaultRandom(),
    cohort: outcomeCohortEnum().notNull(),
    reference: text().unique(), // e.g. CTL-900 for controls
    caseId: uuid()
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    interventionId: uuid()
      .unique()
      .references(() => interventions.id, { onDelete: 'restrict' }),
    windowDays: integer().notNull(),
    baselineActivations: integer().notNull(),
    activationsAfter: integer().notNull(),
    changePct: integer().notNull(),
    outcomeType: outcomeTypeEnum().notNull(),
    recovered: boolean().notNull(),
    tolerancePct: integer().notNull().default(5),
    note: text(),
    simulated: boolean().notNull().default(true),
    measuredAt: timestamptz().notNull(),
  },
  (t) => [index('outcomes_cohort_idx').on(t.cohort)],
);
