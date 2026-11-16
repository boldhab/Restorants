import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, pool, emailService, resetTestDatabase } from '../helpers/test-app.js';
import { withTransaction } from '../../src/database/transaction.js';
import express from 'express';
import { errorHandler } from '../../src/middleware/error-handler.js';
const payload = {
  name: 'Foundation Café',
  slug: 'foundation-cafe',
  category: 'Café',
  phone: '+251911111111',
  email: 'cafe@example.com',
  country: 'Ethiopia',
  city: 'Addis Ababa',
  address: 'Bole Road',
  currency: 'ETB',
  timezone: 'Africa/Addis_Ababa',
};
async function user() {
  const agent = request.agent(app);
  await agent
    .post('/api/v1/auth/register')
    .send({
      email: 'foundation@example.com',
      password: 'Password123!',
      full_name: 'Foundation Owner',
    })
    .expect(201);
  const token = emailService
    .getLastEmailFor('foundation@example.com')!
    .text.match(/token=([a-f0-9]+)/)![1];
  await agent.post('/api/v1/auth/verify-email').send({ token }).expect(200);
  const login = await agent
    .post('/api/v1/auth/login')
    .send({ email: 'foundation@example.com', password: 'Password123!' })
    .expect(200);
  return { agent, csrf: login.body.csrfToken, userId: login.body.user.id, token };
}
describe('Foundation regression checks', () => {
  beforeEach(async () => {
    await resetTestDatabase();
    emailService.clearSentEmails();
  });
  it('serializes simultaneous retries and rejects mismatched payloads', async () => {
    const { agent, csrf } = await user();
    const send = (body = payload) =>
      agent
        .post('/api/v1/restaurants')
        .set('X-CSRF-Token', csrf)
        .set('Idempotency-Key', 'concurrent-creation')
        .send(body);
    const [a, b] = await Promise.all([send(), send()]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(a.body.restaurant.id, b.body.restaurant.id);
    assert.equal((await pool.query('SELECT count(*) FROM restaurants')).rows[0].count, '1');
    assert.equal((await send({ ...payload, name: 'Another name' })).status, 409);
  });
  it('rolls back all onboarding records when role assignment fails and releases the connection', async () => {
    const { agent, csrf } = await user();
    await pool.query("DELETE FROM roles WHERE name='owner'");
    await agent.post('/api/v1/restaurants').set('X-CSRF-Token', csrf).send(payload).expect(500);
    for (const table of ['restaurants', 'branches', 'restaurant_memberships', 'idempotency_keys'])
      assert.equal((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count, '0');
    await assert.rejects(
      withTransaction(async (client) => {
        await client.query(
          "INSERT INTO users(email,password_hash,full_name) VALUES ('rollback@example.com','hash','Rollback')"
        );
        throw new Error('intentional');
      })
    );
    assert.equal(
      (await pool.query("SELECT count(*) FROM users WHERE email='rollback@example.com'")).rows[0]
        .count,
      '0'
    );
    assert.equal(pool.waitingCount, 0);
  });
  it('rejects public privilege escalation and cross-origin login, including bearer-header CSRF bypass', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'bad@example.com',
        full_name: 'Bad Actor',
        password: 'Password123!',
        is_platform_admin: true,
      })
      .expect(400);
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
    const { agent } = await user();
    await agent
      .post('/api/v1/restaurants')
      .set('Authorization', 'Bearer bogus')
      .send(payload)
      .expect(403);
  });
  it('consumes a verification token exactly once under concurrent requests and rejects expiry', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'race@example.com', password: 'Password123!', full_name: 'Race User' })
      .expect(201);
    const token = emailService
      .getLastEmailFor('race@example.com')!
      .text.match(/token=([a-f0-9]+)/)![1];
    const outcomes = await Promise.all([
      request(app).post('/api/v1/auth/verify-email').send({ token }),
      request(app).post('/api/v1/auth/verify-email').send({ token }),
    ]);
    assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 400]);
    await request(app).post('/api/v1/auth/password/forgot').send({ email: 'race@example.com' });
    const reset = emailService
      .getLastEmailFor('race@example.com')!
      .text.match(/token=([a-f0-9]+)/)![1];
    await pool.query("UPDATE password_reset_tokens SET expires_at=now()-interval '1 second'");
    await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token: reset, password: 'NewPassword123!' })
      .expect(400);
  });
  it('rejects expired verification links and atomically consumes reset tokens', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'expiry@example.com', password: 'Password123!', full_name: 'Expiry User' })
      .expect(201);
    const verification = emailService
      .getLastEmailFor('expiry@example.com')!
      .text.match(/token=([a-f0-9]+)/)![1];
    await pool.query("UPDATE email_verification_tokens SET expires_at=now()-interval '1 second'");
    await request(app).post('/api/v1/auth/verify-email').send({ token: verification }).expect(400);
    await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'expiry@example.com' })
      .expect(200);
    const reset = emailService
      .getLastEmailFor('expiry@example.com')!
      .text.match(/token=([a-f0-9]+)/)![1];
    const results = await Promise.all([
      request(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: reset, password: 'NewPassword123!' }),
      request(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: reset, password: 'NewPassword123!' }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token: reset, password: 'AnotherPassword123!' })
      .expect(400);
  });
  it('expires sessions and rotates the previous session on repeat login', async () => {
    const { agent, csrf } = await user();
    const old = (await pool.query('SELECT token_hash FROM sessions')).rows[0].token_hash;
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'foundation@example.com', password: 'Password123!' })
      .expect(200);
    assert.ok(
      (await pool.query('SELECT revoked_at FROM sessions WHERE token_hash=$1', [old])).rows[0]
        .revoked_at
    );
    await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
    assert.equal((await agent.get('/api/v1/auth/me')).body.authenticated, false);
  });
  it('enforces relationship constraints, duplicate memberships and immutable tenants', async () => {
    const { agent, csrf, userId } = await user();
    const a = (await agent.post('/api/v1/restaurants').set('X-CSRF-Token', csrf).send(payload)).body
      .restaurant.id;
    const b = (
      await agent
        .post('/api/v1/restaurants')
        .set('X-CSRF-Token', csrf)
        .send({ ...payload, slug: 'second-cafe' })
    ).body.restaurant.id;
    await assert.rejects(
      pool.query('INSERT INTO restaurant_memberships(restaurant_id,user_id) VALUES ($1,$2)', [
        a,
        userId,
      ]),
      { code: '23505' }
    );
    const role = (
      await pool.query(
        "INSERT INTO roles(restaurant_id,name,is_system) VALUES ($1,'custom',false) RETURNING id",
        [b]
      )
    ).rows[0].id;
    const membership = (
      await pool.query('SELECT id FROM restaurant_memberships WHERE restaurant_id=$1', [a])
    ).rows[0].id;
    await assert.rejects(
      pool.query('INSERT INTO membership_roles VALUES ($1,$2)', [membership, role]),
      { code: '23514' }
    );
    await agent
      .patch(`/api/v1/restaurants/${a}`)
      .set('X-CSRF-Token', csrf)
      .send({ restaurant_id: b, name: 'Tampered' })
      .expect(400);
  });
  it('handles oversized JSON, unexpected exceptions and failed readiness safely', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'x'.repeat(1024 * 1024 + 1) })
      .expect(413);
    const testApp = express();
    testApp.get('/boom', () => {
      throw new Error('sensitive internal detail');
    });
    testApp.use(errorHandler);
    const failure = await request(testApp).get('/boom');
    assert.equal(failure.status, 500);
    assert.ok(!JSON.stringify(failure.body).includes('sensitive'));
    const original = pool.connect;
    pool.connect = async () => {
      throw new Error('offline');
    };
    try {
      await request(app).get('/api/v1/ready').expect(503);
    } finally {
      pool.connect = original;
    }
  });
});
