import { runMigrations } from '../src/database/migrator.js';
import { closePool } from '../src/database/pool.js';
import { logger } from '../src/config/logger.js';

async function main() {
  try {
    logger.info('Starting database migration...');
    await runMigrations();
    logger.info('Database migrations completed successfully.');
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
