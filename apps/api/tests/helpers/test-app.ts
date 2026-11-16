import { seedPermissions } from '../../database/seeds/permissions.seed.js';
import { seedRoles } from '../../database/seeds/roles.seed.js';
import { after } from 'node:test';
process.env.NODE_ENV = 'test';
const testUrl =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:1234@127.0.0.1:5432/zayqora_test';
if (!new URL(testUrl).pathname.endsWith('_test') || process.env.NODE_ENV !== 'test')
  throw new Error('Refusing destructive setup: database must end in _test');
process.env.DATABASE_URL = testUrl;
const { app } = await import('../../src/app.js');
const { pool } = await import('../../src/database/pool.js');
const { emailService } = await import('../../src/integrations/email/email-service.js');
after(async () => {
  await pool.end();
});

export { app, pool, emailService };

export async function resetTestDatabase() {
  const client = await pool.connect();
  try {
    // Truncate business tables while preserving roles and permissions
    await client.query(`
      TRUNCATE TABLE 
        audit_logs,
        idempotency_keys,
        membership_roles,
        restaurant_memberships,
        branches,
        restaurants,
        sessions,
        email_verification_tokens,
        password_reset_tokens,
        users
      CASCADE;
    `);
    await seedPermissions(client);
    await seedRoles(client);
  } finally {
    client.release();
  }
}
