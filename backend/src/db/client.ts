import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import * as schema from './schema/index.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

// An idle client can error (e.g. Neon closes it); log it instead of crashing the process.
pool.on('error', (err) => {
  logger.error('Idle database connection error', { message: err.message });
});

export const db = drizzle({ client: pool, schema, casing: 'snake_case' });
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Either the pool-backed `db` or an open transaction: repositories accept both. */
export type Executor = Database | Transaction;

export type DatabaseStatus = { status: 'up'; latencyMs: number } | { status: 'down' };

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref();
  });
}

/** Round-trips `select 1`. Never throws; failure details are logged, not returned. */
export async function checkDatabase(timeoutMs = 3_000): Promise<DatabaseStatus> {
  const startedAt = performance.now();
  try {
    await Promise.race([pool.query('select 1'), rejectAfter(timeoutMs)]);
    return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
  } catch (err) {
    logger.warn('Database health check failed', {
      reason: err instanceof Error ? err.message : 'unknown error',
    });
    return { status: 'down' };
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
