/**
 * `npm run db:seed`: wipes every table and loads the synthetic pilot dataset in ONE
 * transaction (all-or-nothing, re-runnable). Refuses to run in production unless --force.
 */
import { getTableName, sql } from 'drizzle-orm';
import type { PgInsertValue, PgTable } from 'drizzle-orm/pg-core';

import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { closeDatabase, db } from '../client.js';
import * as schema from '../schema/index.js';
import { buildBehaviour } from './behaviour.js';
import { buildCatalog } from './catalog.js';
import { buildDetection } from './detection.js';
import { buildHistory } from './history.js';
import { buildPilotDataset } from './pilot-dataset.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const BATCH_SIZE = 500;

/** Every table, in an order that satisfies foreign keys when inserting. */
const ALL_TABLES: PgTable[] = [
  schema.reasons,
  schema.bundles,
  schema.actions,
  schema.actionReasons,
  schema.campaignHistory,
  schema.customers,
  schema.customerWeeklyUsage,
  schema.bundleActivations,
  schema.networkFaults,
  schema.detectionRuns,
  schema.customerMetrics,
  schema.cases,
  schema.feedbackRequests,
  schema.customerFeedback,
  schema.reasonClassifications,
  schema.recommendations,
  schema.interventions,
  schema.outcomes,
];

function buildSeed() {
  const data = buildPilotDataset();
  const catalog = buildCatalog(data);
  const behaviour = buildBehaviour(data);
  const detection = buildDetection(data, behaviour.byCustomer);
  const history = buildHistory(data, detection);
  const careContacts = behaviour.careContacts.map((c) => ({
    customerId: c.customerId,
    caseId: detection.caseIdByCustomer.get(c.customerId) ?? null,
    channel: 'customer_service',
    region: c.region,
    rawText: c.rawText,
    simulated: true,
    receivedAt: c.receivedAt,
  }));
  return { catalog, behaviour, detection, history, careContacts };
}

async function insertBatched<T extends PgTable>(
  tx: Tx,
  table: T,
  rows: PgInsertValue<T>[],
): Promise<number> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await tx.insert(table).values(rows.slice(i, i + BATCH_SIZE));
  }
  return rows.length;
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    logger.error('Refusing to seed in production (it deletes all data). Pass --force to override.');
    process.exitCode = 1;
    return;
  }

  const startedAt = performance.now();
  const { catalog, behaviour, detection, history, careContacts } = buildSeed();
  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    const names = ALL_TABLES.map((t) => `"${getTableName(t)}"`).join(', ');
    await tx.execute(sql.raw(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`));

    const s = schema;
    counts.reasons = await insertBatched(tx, s.reasons, catalog.reasons);
    counts.bundles = await insertBatched(tx, s.bundles, catalog.bundles);
    counts.actions = await insertBatched(tx, s.actions, catalog.actions);
    counts.action_reasons = await insertBatched(tx, s.actionReasons, catalog.actionReasons);
    counts.campaign_history = await insertBatched(tx, s.campaignHistory, catalog.campaignHistory);
    counts.customers = await insertBatched(tx, s.customers, behaviour.customers);
    counts.customer_weekly_usage = await insertBatched(
      tx,
      s.customerWeeklyUsage,
      behaviour.weeklyUsage,
    );
    counts.bundle_activations = await insertBatched(tx, s.bundleActivations, behaviour.activations);
    counts.network_faults = await insertBatched(tx, s.networkFaults, behaviour.networkFaults);
    counts.detection_runs = await insertBatched(tx, s.detectionRuns, [detection.run]);
    counts.customer_metrics = await insertBatched(tx, s.customerMetrics, detection.metrics);
    counts.cases = await insertBatched(tx, s.cases, detection.cases);
    counts.feedback_requests = await insertBatched(
      tx,
      s.feedbackRequests,
      history.feedbackRequests,
    );
    counts.customer_feedback = await insertBatched(tx, s.customerFeedback, [
      ...history.replies,
      ...careContacts,
    ]);
    counts.reason_classifications = await insertBatched(
      tx,
      s.reasonClassifications,
      history.classifications,
    );
    counts.recommendations = await insertBatched(tx, s.recommendations, history.recommendations);
    counts.interventions = await insertBatched(tx, s.interventions, history.interventions);
    counts.outcomes = await insertBatched(tx, s.outcomes, history.outcomes);
  });

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  logger.info(`Seed complete: ${total} rows in ${Math.round(performance.now() - startedAt)}ms`, {
    counts,
  });
}

main()
  .catch((err: unknown) => {
    logger.error('Seed failed; nothing was changed (transaction rolled back)', {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
