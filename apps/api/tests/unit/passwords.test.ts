import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../../src/shared/security/passwords.js';

describe('Passwords Unit Tests', () => {
  it('hashes plain text passwords and verifies correctly', async () => {
    const plain = 'SuperSecret123!';
    const hash = await hashPassword(plain);

    assert.ok(hash.startsWith('$2'), 'Hash should be a bcrypt format');
    assert.notEqual(hash, plain, 'Hash must not equal plain password');

    const isValid = await verifyPassword(plain, hash);
    assert.equal(isValid, true, 'Correct password must verify');

    const isInvalid = await verifyPassword('WrongPassword', hash);
    assert.equal(isInvalid, false, 'Incorrect password must fail verification');
  });

  it('rejects empty or non-string passwords on hashing', async () => {
    await assert.rejects(async () => {
      await hashPassword('');
    });
    await assert.rejects(async () => {
      await hashPassword(null);
    });
  });

  it('safely returns false for null/empty comparisons', async () => {
    assert.equal(await verifyPassword(null, 'hash'), false);
    assert.equal(await verifyPassword('password', null), false);
  });
});
