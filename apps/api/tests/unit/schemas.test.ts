import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema, slugSchema, createRestaurantSchema } from '@zayqora/contracts';

describe('Contracts & Schemas Unit Tests', () => {
  it('normalizes email to lowercase and trims whitespace', () => {
    const parsed = registerSchema.safeParse({
      email: '  USER.EXAMPLE@DOMAIN.COM  ',
      password: 'StrongPassword123!',
      full_name: 'John Doe',
    });

    assert.equal(parsed.success, true);
    assert.equal(parsed.data.email, 'user.example@domain.com');
  });

  it('rejects passwords shorter than 8 characters', () => {
    const parsed = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'short',
      full_name: 'John Doe',
    });

    assert.equal(parsed.success, false);
    assert.ok(parsed.error.issues.some((e) => e.path.includes('password')));
  });

  it('enforces valid slug format and rejects uppercase or consecutive hyphens', () => {
    assert.equal(slugSchema.safeParse('valid-slug-123').success, true);
    assert.equal(slugSchema.safeParse('Valid-Slug').success, false);
    assert.equal(slugSchema.safeParse('invalid--slug').success, false);
    assert.equal(slugSchema.safeParse('-leading-hyphen').success, false);
    assert.equal(slugSchema.safeParse('trailing-hyphen-').success, false);
  });

  it('validates restaurant creation payload', () => {
    const valid = {
      name: 'Tasty Bites',
      slug: 'tasty-bites',
      category: 'Bistro',
      phone: '+1 555-1234',
      email: 'info@tastybites.com',
      country: 'United States',
      city: 'Austin',
      address: '100 Congress Ave',
      currency: 'usd',
      timezone: 'America/Chicago',
    };

    const res = createRestaurantSchema.safeParse(valid);
    assert.equal(res.success, true);
    assert.equal(res.data.currency, 'USD'); // Uppercased
  });
});
