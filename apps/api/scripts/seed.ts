import { pool } from '../src/database/pool.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { seedPermissions } from '../database/seeds/permissions.seed.js';
import { seedRoles } from '../database/seeds/roles.seed.js';
import { seedDemoRestaurants } from '../database/seeds/demo-restaurants.seed.js';

async function main() {
  if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
    logger.error('Refusing to run demo seed in production environment!');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    logger.info('Starting database seeding...');
    await client.query('BEGIN');

    logger.info('Seeding permissions...');
    await seedPermissions(client);

    logger.info('Seeding system roles...');
    await seedRoles(client);

    logger.info('Seeding demonstration restaurants and users...');
    await seedDemoRestaurants(client);

    await client.query('COMMIT');
    logger.info('Database seeding completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Database seeding failed');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
