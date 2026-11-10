/**
 * `npm run db:migrate:deploy`: applies pending SQL migrations from `drizzle/` with Drizzle's
 * runtime migrator, so deploys don't need drizzle-kit (a devDependency). Idempotent: already
 * applied migrations are skipped. Use as Railway's pre-deploy command (after `npm run build`).
 */
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { logger } from '../lib/logger.js';
import { closeDatabase, db, pool } from './client.js';

/** src/db/ and dist/db/ are both two levels below backend/, where drizzle/ lives. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

async function appliedCount(): Promise<number> {
  try {
    const { rows } = await pool.query<{ n: number }>(
      'select count(*)::int as n from drizzle.__drizzle_migrations',
    );
    return rows[0]?.n ?? 0;
  } catch {
    return 0; // first deploy: the bookkeeping table doesn't exist yet
  }
}

async function main(): Promise<void> {
  const before = await appliedCount();
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  const after = await appliedCount();
  logger.info(`Migrations up to date: ${after - before} applied now, ${after} in total`);
}

main()
  .catch((err: unknown) => {
    logger.error('Migration failed', { message: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
