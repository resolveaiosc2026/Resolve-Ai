import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabase } from './db/client.js';
import { logger } from './lib/logger.js';

const server = createApp().listen(env.PORT, () => {
  logger.info(`Resolve AI API listening on http://localhost:${env.PORT}/api/v1`, {
    environment: env.NODE_ENV,
  });
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    closeDatabase()
      .catch((err: unknown) =>
        logger.error('Error closing database pool', {
          message: err instanceof Error ? err.message : String(err),
        }),
      )
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
