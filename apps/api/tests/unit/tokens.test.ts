import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOpaqueToken,
  hashToken,
  hashPayload,
  generateCsrfToken,
} from '../../src/shared/security/tokens.js';

describe('Tokens Unit Tests', () => {
  it('generates random hex tokens of correct length', () => {
    const token = generateOpaqueToken(32);
    assert.equal(token.length, 64);

    const anotherToken = generateOpaqueToken(32);
    assert.notEqual(token, anotherToken, 'Successive tokens must be unique');
  });

  it('generates 256-bit SHA-256 hashes deterministically', () => {
    const raw = 'my-token-value';
    const hash1 = hashToken(raw);
    const hash2 = hashToken(raw);

    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2, 'Hash must be deterministic');
    assert.notEqual(hash1, raw, 'Hash must be transformed');
  });

  it('hashes payload objects deterministically for idempotency check', () => {
    const payloadA = { name: 'Resto', slug: 'resto-a' };
    const payloadB = { name: 'Resto', slug: 'resto-a' };
    const payloadC = { name: 'Resto', slug: 'resto-c' };

    const hashA = hashPayload(payloadA);
    const hashB = hashPayload(payloadB);
    const hashC = hashPayload(payloadC);

    assert.equal(hashA, hashB);
    assert.notEqual(hashA, hashC);
  });

  it('generates CSRF tokens', () => {
    const csrf = generateCsrfToken();
    assert.ok(csrf.length >= 32);
  });
});
