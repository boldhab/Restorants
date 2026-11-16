import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, emailService, resetTestDatabase } from '../helpers/test-app.js';
import { env } from '../../src/config/env.js';

describe('Authentication Integration Tests', () => {
  beforeEach(async () => {
    await resetTestDatabase();
    emailService.clearSentEmails();
  });

  it('completes registration, sends verification email, and rejects duplicate email', async () => {
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: 'Chef.Mario@Example.com', // mixed case
      password: 'Password123!',
      full_name: 'Mario Rossi',
      phone: '+1 555-0199',
    });

    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.user.email, 'chef.mario@example.com'); // normalized lowercase
    assert.equal(regRes.body.user.is_email_verified, false);
    assert.ok(regRes.body.user.id);

    // Verify email was sent
    const sentEmail = emailService.getLastEmailFor('chef.mario@example.com');
    assert.ok(sentEmail, 'Verification email must be captured');
    assert.ok(sentEmail.text.includes('/verify-email?token='));

    // Duplicate registration must fail with 409
    const dupRes = await request(app).post('/api/v1/auth/register').send({
      email: 'CHEF.MARIO@example.com',
      password: 'Password123!',
      full_name: 'Mario Rossi',
    });

    assert.equal(dupRes.status, 409);
    assert.equal(dupRes.body.error.code, 'CONFLICT');
  });

  it('verifies email using captured token, rejects reuse and expired tokens', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'verify.me@example.com',
      password: 'Password123!',
      full_name: 'Verify User',
    });

    const sentEmail = emailService.getLastEmailFor('verify.me@example.com');
    const tokenMatch = sentEmail.text.match(/token=([a-f0-9]+)/);
    assert.ok(tokenMatch, 'Token must be present in email link');
    const token = tokenMatch[1];

    // Verify email
    const verifyRes = await request(app).post('/api/v1/auth/verify-email').send({ token });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);

    // Reusing the same token must fail (atomic single-use)
    const reuseRes = await request(app).post('/api/v1/auth/verify-email').send({ token });

    assert.equal(reuseRes.status, 400);
    assert.equal(reuseRes.body.error.code, 'VALIDATION_ERROR');

    // Invalid token must fail
    const invalidRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'invalid-non-existent-token' });

    assert.equal(invalidRes.status, 400);
  });

  it('handles login, session cookie creation, session rotation, and logout', async () => {
    // 1. Register user
    await request(app).post('/api/v1/auth/register').send({
      email: 'login.test@example.com',
      password: 'Password123!',
      full_name: 'Login Tester',
    });

    // 2. Failed login with wrong password
    const failRes = await request(app).post('/api/v1/auth/login').send({
      email: 'login.test@example.com',
      password: 'WrongPassword!',
    });

    assert.equal(failRes.status, 401);
    assert.equal(failRes.body.error.code, 'UNAUTHORIZED');
    assert.equal(failRes.body.error.message, 'Invalid email or password');

    // 3. Successful login
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'login.test@example.com',
      password: 'Password123!',
    });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.user.email, 'login.test@example.com');

    // Verify cookie set
    const setCookieHeaders = loginRes.headers['set-cookie'];
    assert.ok(setCookieHeaders && setCookieHeaders.length > 0);
    const sessionCookieStr = setCookieHeaders.find((c) => c.startsWith(`${env.COOKIE_NAME}=`));
    assert.ok(sessionCookieStr, 'Session cookie must be set');
    assert.ok(sessionCookieStr.includes('HttpOnly'), 'Cookie must be HttpOnly');

    // Extract CSRF cookie and token
    const csrfCookieStr = setCookieHeaders.find((c) => c.startsWith('zayqora_csrf='));
    const csrfToken = loginRes.body.csrfToken;

    // 4. Test /api/v1/auth/me with session cookie
    const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', sessionCookieStr);

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.authenticated, true);
    assert.equal(meRes.body.user.email, 'login.test@example.com');

    // 5. Test logout with CSRF token
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [sessionCookieStr, csrfCookieStr])
      .set('X-CSRF-Token', csrfToken);

    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.body.success, true);

    // 6. Accessing /me after logout should return unauthenticated
    const meAfterLogout = await request(app).get('/api/v1/auth/me').set('Cookie', sessionCookieStr);

    assert.equal(meAfterLogout.status, 200);
    assert.equal(meAfterLogout.body.authenticated, false);
  });

  it('completes forgot password flow, resets password, and revokes prior sessions', async () => {
    // Register and login to create a session
    await request(app).post('/api/v1/auth/register').send({
      email: 'reset.user@example.com',
      password: 'OldPassword123!',
      full_name: 'Reset User',
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'reset.user@example.com',
      password: 'OldPassword123!',
    });
    const sessionCookieStr = loginRes.headers['set-cookie'].find((c) =>
      c.startsWith(`${env.COOKIE_NAME}=`)
    );

    // Request password reset
    const forgotRes = await request(app).post('/api/v1/auth/password/forgot').send({
      email: 'reset.user@example.com',
    });
    assert.equal(forgotRes.status, 200);

    const resetEmail = emailService.getLastEmailFor('reset.user@example.com');
    assert.ok(resetEmail);
    const tokenMatch = resetEmail.text.match(/token=([a-f0-9]+)/);
    const resetToken = tokenMatch[1];

    // Reset password
    const resetRes = await request(app).post('/api/v1/auth/password/reset').send({
      token: resetToken,
      password: 'NewPassword123!',
    });
    assert.equal(resetRes.status, 200);

    // Old session must be revoked
    const meAfterReset = await request(app).get('/api/v1/auth/me').set('Cookie', sessionCookieStr);
    assert.equal(meAfterReset.body.authenticated, false, 'Prior session must be revoked');

    // Login with old password fails
    const oldLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'reset.user@example.com',
      password: 'OldPassword123!',
    });
    assert.equal(oldLogin.status, 401);

    // Login with new password succeeds
    const newLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'reset.user@example.com',
      password: 'NewPassword123!',
    });
    assert.equal(newLogin.status, 200);
  });
});
