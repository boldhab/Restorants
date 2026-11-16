import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../helpers/test-app.js';

describe('Health and System Foundation Integration Tests', () => {
  it('GET /api/v1/health returns process liveness and uptime', async () => {
    const res = await request(app).get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(typeof res.body.uptime === 'number');
    assert.ok(res.body.timestamp);
  });

  it('GET /api/v1/ready checks database connection and returns readiness', async () => {
    const res = await request(app).get('/api/v1/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database, 'connected');
  });

  it('returns structured 400 for malformed JSON payload', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "email": "test@example.com", broken: json }');

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.equal(res.body.error.message, 'Malformed JSON payload');
    assert.ok(res.body.error.requestId);
  });

  it('returns structured 404 for non-existent route with request ID', async () => {
    const res = await request(app)
      .get('/api/v1/non-existent-endpoint')
      .set('X-Request-Id', 'custom-req-id-1234');

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.equal(res.headers['x-request-id'], 'custom-req-id-1234');
    assert.equal(res.body.error.requestId, 'custom-req-id-1234');
  });
});
