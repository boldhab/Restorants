import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
export async function runMigrations() {
  await runner({
    databaseUrl: env.DATABASE_URL,
    dir: fileURLToPath(new URL('../../database/migrations', import.meta.url)),
    direction: 'up',
    migrationsTable: 'phase1_migrations',
    count: Infinity,
    checkOrder: true,
    verbose: false,
  });
}
