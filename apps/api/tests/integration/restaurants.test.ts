import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, resetTestDatabase } from '../helpers/test-app.js';
import { env } from '../../src/config/env.js';
import { pool } from '../../src/database/pool.js';

describe('Transactional Restaurant Creation & Workspace Integration Tests', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  // Helper to register, verify, and login a user
  async function createVerifiedUser(email, password = 'Password123!', fullName = 'Owner User') {
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email,
      password,
      full_name: fullName,
    });

    const userId = regRes.body.user.id;
    // Mark verified directly in DB for test simplicity
    await pool.query('UPDATE users SET is_email_verified = TRUE WHERE id = $1', [userId]);

    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies.find((c) => c.startsWith(`${env.COOKIE_NAME}=`));
    const csrfCookie = cookies.find((c) => c.startsWith('zayqora_csrf='));
    const csrfToken = loginRes.body.csrfToken;

    return {
      userId,
      email,
      cookies: [sessionCookie, csrfCookie],
      csrfToken,
    };
  }

  it('rejects restaurant creation for unverified users', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'unverified@example.com',
      password: 'Password123!',
      full_name: 'Unverified Guy',
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'unverified@example.com',
      password: 'Password123!',
    });
    const sessionCookie = loginRes.headers['set-cookie'].find((c) =>
      c.startsWith(`${env.COOKIE_NAME}=`)
    );
    const csrfCookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('zayqora_csrf='));

    const createRes = await request(app)
      .post('/api/v1/restaurants')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('X-CSRF-Token', loginRes.body.csrfToken)
      .send({
        name: 'Unverified Place',
        slug: 'unverified-place',
        category: 'Cafe',
        phone: '+1 555-9988',
        email: 'unverified@example.com',
        country: 'US',
        city: 'Denver',
        address: '100 Main St',
        currency: 'USD',
        timezone: 'America/Denver',
      });

    assert.equal(createRes.status, 403);
    assert.equal(createRes.body.error.code, 'UNVERIFIED_EMAIL');
  });

  it('atomically creates restaurant, default branch, owner membership, and role', async () => {
    const user = await createVerifiedUser('owner.atomic@example.com');

    const payload = {
      name: 'Trattoria Bella',
      slug: 'trattoria-bella',
      category: 'Italian Fine Dining',
      phone: '+1 555-8888',
      email: 'info@trattoriabella.com',
      country: 'United States',
      city: 'Chicago',
      address: '777 Michigan Ave',
      currency: 'USD',
      timezone: 'America/Chicago',
    };

    const res = await request(app)
      .post('/api/v1/restaurants')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrfToken)
      .send(payload);

    assert.equal(res.status, 201);
    const { restaurant, defaultBranch, membership } = res.body;

    assert.ok(restaurant.id);
    assert.equal(restaurant.name, 'Trattoria Bella');
    assert.equal(restaurant.slug, 'trattoria-bella');
    assert.equal(restaurant.status, 'onboarding');

    // Default branch verification
    assert.ok(defaultBranch.id);
    assert.equal(defaultBranch.restaurant_id, restaurant.id);
    assert.equal(defaultBranch.is_default, true);
    assert.equal(defaultBranch.name, 'Main Branch');

    // Owner membership and role verification
    assert.ok(membership.id);
    assert.equal(membership.status, 'active');
    assert.equal(membership.role, 'owner');

    // Check audit log
    const auditRes = await pool.query(
      `SELECT * FROM audit_logs WHERE restaurant_id = $1 AND action = 'restaurant.created'`,
      [restaurant.id]
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].actor_id, user.userId);
  });

  it('handles idempotency key caching and detects payload mismatch conflicts', async () => {
    const user = await createVerifiedUser('idempotent.owner@example.com');
    const idempotencyKey = 'unique-key-uuid-999';

    const payload1 = {
      name: 'Idempotent Cafe',
      slug: 'idempotent-cafe',
      category: 'Cafe',
      phone: '+1 555-1122',
      email: 'cafe@example.com',
      country: 'US',
      city: 'Seattle',
      address: '1 Pine St',
      currency: 'USD',
      timezone: 'America/Los_Angeles',
    };

    // First submission
    const res1 = await request(app)
      .post('/api/v1/restaurants')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrfToken)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload1);

    assert.equal(res1.status, 201);
    const originalRestaurantId = res1.body.restaurant.id;

    // Retry identical request with same idempotency key
    const res2 = await request(app)
      .post('/api/v1/restaurants')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrfToken)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload1);

    assert.equal(res2.status, 201);
    assert.equal(res2.body.restaurant.id, originalRestaurantId);

    // Verify no duplicate restaurants created in DB
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM restaurants WHERE slug = 'idempotent-cafe'`
    );
    assert.equal(parseInt(countRes.rows[0].count, 10), 1);

    // Mismatched payload with same key must return 409 IDEMPOTENCY_CONFLICT
    const payloadMismatch = { ...payload1, name: 'Changed Name' };
    const mismatchRes = await request(app)
      .post('/api/v1/restaurants')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrfToken)
      .set('Idempotency-Key', idempotencyKey)
      .send(payloadMismatch);

    assert.equal(mismatchRes.status, 409);
    assert.equal(mismatchRes.body.error.code, 'IDEMPOTENCY_CONFLICT');
  });

  it('allows owner to list, view, and update restaurant settings', async () => {
    const user = await createVerifiedUser('settings.owner@example.com');

    // Create restaurant
    const createRes = await request(app)
      .post('/api/v1/restaurants')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrfToken)
      .send({
        name: 'Settings Bistro',
        slug: 'settings-bistro',
        category: 'Bistro',
        phone: '+1 555-3344',
        email: 'bistro@example.com',
        country: 'US',
        city: 'Miami',
        address: '500 Ocean Dr',
        currency: 'USD',
        timezone: 'America/New_York',
      });

    const restaurantId = createRes.body.restaurant.id;

    // List restaurants
    const listRes = await request(app).get('/api/v1/restaurants').set('Cookie', user.cookies);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.restaurants.length, 1);
    assert.equal(listRes.body.restaurants[0].id, restaurantId);

    // Get restaurant by id
    const getRes = await request(app)
      .get(`/api/v1/restaurants/${restaurantId}`)
      .set('Cookie', user.cookies);

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.restaurant.name, 'Settings Bistro');
    assert.ok(getRes.body.roles.includes('owner'));

    // Update restaurant settings
    const updateRes = await request(app)
      .patch(`/api/v1/restaurants/${restaurantId}`)
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrfToken)
      .send({
        name: 'Settings Bistro & Bar',
        phone: '+1 555-9999',
      });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.restaurant.name, 'Settings Bistro & Bar');
    assert.equal(updateRes.body.restaurant.phone, '+1 555-9999');

    // List branches
    const branchRes = await request(app)
      .get(`/api/v1/restaurants/${restaurantId}/branches`)
      .set('Cookie', user.cookies);

    assert.equal(branchRes.status, 200);
    assert.equal(branchRes.body.branches.length, 1);
    assert.equal(branchRes.body.branches[0].is_default, true);
  });
});
