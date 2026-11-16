import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, resetTestDatabase } from '../helpers/test-app.js';
import { env } from '../../src/config/env.js';
import { pool } from '../../src/database/pool.js';
import { RoleCode } from '@zayqora/contracts';

describe('Tenant Isolation and Security Access Tests', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function createVerifiedUser(email, password = 'Password123!', fullName = 'Security User') {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, full_name: fullName });
    const userId = regRes.body.user.id;
    await pool.query('UPDATE users SET is_email_verified = TRUE WHERE id = $1', [userId]);

    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies.find((c) => c.startsWith(`${env.COOKIE_NAME}=`));
    const csrfCookie = cookies.find((c) => c.startsWith('zayqora_csrf='));

    return {
      userId,
      email,
      cookies: [sessionCookie, csrfCookie],
      csrfToken: loginRes.body.csrfToken,
    };
  }

  async function createRestaurantFor(user, slug, name) {
    const res = await request(app)
      .post('/api/v1/restaurants')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrfToken)
      .send({
        name,
        slug,
        category: 'Bistro',
        phone: '+1 555-0000',
        email: `${slug}@example.com`,
        country: 'US',
        city: 'City',
        address: '100 Street',
        currency: 'USD',
        timezone: 'UTC',
      });
    return res.body.restaurant.id;
  }

  it('Owner A cannot read or edit Restaurant B (cross-tenant isolation)', async () => {
    const ownerA = await createVerifiedUser('owner.a@example.com', 'Password123!', 'Owner A');
    const ownerB = await createVerifiedUser('owner.b@example.com', 'Password123!', 'Owner B');

    const _restaurantAId = await createRestaurantFor(ownerA, 'resto-a', 'Restaurant A');
    const restaurantBId = await createRestaurantFor(ownerB, 'resto-b', 'Restaurant B');

    // Owner A attempts to read Restaurant B
    const readRes = await request(app)
      .get(`/api/v1/restaurants/${restaurantBId}`)
      .set('Cookie', ownerA.cookies);

    assert.equal(readRes.status, 403, 'Cross-tenant read must be forbidden');
    assert.equal(readRes.body.error.code, 'FORBIDDEN');

    // Owner A attempts to update Restaurant B
    const updateRes = await request(app)
      .patch(`/api/v1/restaurants/${restaurantBId}`)
      .set('Cookie', ownerA.cookies)
      .set('X-CSRF-Token', ownerA.csrfToken)
      .send({ name: 'Hacked Restaurant B' });

    assert.equal(updateRes.status, 403, 'Cross-tenant update must be forbidden');
    assert.equal(updateRes.body.error.code, 'FORBIDDEN');

    // Owner A attempts to read branches of Restaurant B
    const branchRes = await request(app)
      .get(`/api/v1/restaurants/${restaurantBId}/branches`)
      .set('Cookie', ownerA.cookies);

    assert.equal(branchRes.status, 403);
  });

  it('Restricted member (staff) cannot perform owner operations like updating restaurant settings', async () => {
    const owner = await createVerifiedUser('owner.main@example.com', 'Password123!', 'Main Owner');
    const staff = await createVerifiedUser(
      'staff.member@example.com',
      'Password123!',
      'Staff Member'
    );

    const restaurantId = await createRestaurantFor(owner, 'staff-test-resto', 'Staff Test Resto');

    // Add staff user to restaurant with STAFF role
    const staffRoleIdRes = await pool.query(
      `SELECT id FROM roles WHERE name = $1 AND restaurant_id IS NULL`,
      [RoleCode.STAFF]
    );
    const staffRoleId = staffRoleIdRes.rows[0].id;

    const membershipRes = await pool.query(
      `INSERT INTO restaurant_memberships (restaurant_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [restaurantId, staff.userId]
    );
    const membershipId = membershipRes.rows[0].id;

    await pool.query(`INSERT INTO membership_roles (membership_id, role_id) VALUES ($1, $2)`, [
      membershipId,
      staffRoleId,
    ]);

    // Staff member can view restaurant details (has restaurant:read)
    const viewRes = await request(app)
      .get(`/api/v1/restaurants/${restaurantId}`)
      .set('Cookie', staff.cookies);
    assert.equal(viewRes.status, 200);

    // Staff member cannot update restaurant settings (lacks restaurant:update)
    const updateRes = await request(app)
      .patch(`/api/v1/restaurants/${restaurantId}`)
      .set('Cookie', staff.cookies)
      .set('X-CSRF-Token', staff.csrfToken)
      .send({ name: 'Staff Tampered Name' });

    assert.equal(updateRes.status, 403);
    assert.ok(updateRes.body.error.message.includes('Missing required permission'));
  });

  it('permissions in Restaurant A do not carry over to Restaurant B for multi-tenant users', async () => {
    const owner = await createVerifiedUser('multi.owner@example.com');
    const multiUser = await createVerifiedUser('multi.user@example.com');

    const restAId = await createRestaurantFor(owner, 'multi-rest-a', 'Restaurant A');
    const restBId = await createRestaurantFor(owner, 'multi-rest-b', 'Restaurant B');

    const managerRoleId = (
      await pool.query(`SELECT id FROM roles WHERE name = 'manager' AND restaurant_id IS NULL`)
    ).rows[0].id;
    const staffRoleId = (
      await pool.query(`SELECT id FROM roles WHERE name = 'staff' AND restaurant_id IS NULL`)
    ).rows[0].id;

    // In Restaurant A, multiUser is MANAGER (can update settings)
    const memA = (
      await pool.query(
        `INSERT INTO restaurant_memberships (restaurant_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id`,
        [restAId, multiUser.userId]
      )
    ).rows[0].id;
    await pool.query(`INSERT INTO membership_roles (membership_id, role_id) VALUES ($1, $2)`, [
      memA,
      managerRoleId,
    ]);

    // In Restaurant B, multiUser is STAFF (cannot update settings)
    const memB = (
      await pool.query(
        `INSERT INTO restaurant_memberships (restaurant_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id`,
        [restBId, multiUser.userId]
      )
    ).rows[0].id;
    await pool.query(`INSERT INTO membership_roles (membership_id, role_id) VALUES ($1, $2)`, [
      memB,
      staffRoleId,
    ]);

    // multiUser updating Rest A succeeds
    const updateARes = await request(app)
      .patch(`/api/v1/restaurants/${restAId}`)
      .set('Cookie', multiUser.cookies)
      .set('X-CSRF-Token', multiUser.csrfToken)
      .send({ name: 'Updated Rest A' });
    assert.equal(updateARes.status, 200);

    // multiUser updating Rest B fails (403)
    const updateBRes = await request(app)
      .patch(`/api/v1/restaurants/${restBId}`)
      .set('Cookie', multiUser.cookies)
      .set('X-CSRF-Token', multiUser.csrfToken)
      .send({ name: 'Updated Rest B' });
    assert.equal(updateBRes.status, 403);
  });

  it('revoked members immediately lose access to restaurant resources', async () => {
    const owner = await createVerifiedUser('revoked.owner@example.com');
    const user = await createVerifiedUser('revoked.member@example.com');

    const restId = await createRestaurantFor(owner, 'revoked-test-resto', 'Revoke Test Resto');
    const staffRoleId = (
      await pool.query(`SELECT id FROM roles WHERE name = 'staff' AND restaurant_id IS NULL`)
    ).rows[0].id;

    const memRes = await pool.query(
      `INSERT INTO restaurant_memberships (restaurant_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [restId, user.userId]
    );
    await pool.query(`INSERT INTO membership_roles (membership_id, role_id) VALUES ($1, $2)`, [
      memRes.rows[0].id,
      staffRoleId,
    ]);

    // Active access works
    const okRes = await request(app)
      .get(`/api/v1/restaurants/${restId}`)
      .set('Cookie', user.cookies);
    assert.equal(okRes.status, 200);

    // Revoke membership
    await pool.query(`UPDATE restaurant_memberships SET status = 'revoked' WHERE id = $1`, [
      memRes.rows[0].id,
    ]);

    // Subsequent access is denied with 403
    const deniedRes = await request(app)
      .get(`/api/v1/restaurants/${restId}`)
      .set('Cookie', user.cookies);
    assert.equal(deniedRes.status, 403);
    assert.ok(deniedRes.body.error.message.includes('inactive or revoked'));
  });

  it('rejects state-changing cookie requests without valid CSRF token', async () => {
    const user = await createVerifiedUser('csrf.tester@example.com');

    // Missing CSRF token header
    const noTokenRes = await request(app)
      .post('/api/v1/restaurants')
      .set('Cookie', user.cookies)
      .send({
        name: 'CSRF Attack Place',
        slug: 'csrf-place',
        category: 'Cafe',
        phone: '+1 555-0011',
        email: 'csrf@test.com',
        country: 'US',
        city: 'City',
        address: '100 St',
        currency: 'USD',
        timezone: 'UTC',
      });

    assert.equal(noTokenRes.status, 403);
    assert.equal(noTokenRes.body.error.code, 'CSRF_ERROR');

    // Invalid CSRF token header
    const badTokenRes = await request(app)
      .post('/api/v1/restaurants')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', 'forged-token-value')
      .send({
        name: 'CSRF Attack Place',
        slug: 'csrf-place-2',
        category: 'Cafe',
        phone: '+1 555-0011',
        email: 'csrf@test.com',
        country: 'US',
        city: 'City',
        address: '100 St',
        currency: 'USD',
        timezone: 'UTC',
      });

    assert.equal(badTokenRes.status, 403);
    assert.equal(badTokenRes.body.error.code, 'CSRF_ERROR');
  });

  it('proves restaurant owners do not gain platform administrator access', async () => {
    const owner = await createVerifiedUser('owner.notadmin@example.com');
    await createRestaurantFor(owner, 'non-admin-resto', 'Non Admin Resto');

    // Check user record
    const userRes = await pool.query(`SELECT is_platform_admin FROM users WHERE id = $1`, [
      owner.userId,
    ]);
    assert.equal(userRes.rows[0].is_platform_admin, false);

    // Check /api/v1/auth/me
    const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', owner.cookies);
    assert.equal(meRes.body.user.is_platform_admin, false);
  });
});
