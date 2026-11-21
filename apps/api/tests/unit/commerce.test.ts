import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkoutAmounts,
  commerceSettingsSchema,
  defaultCommerceSettings,
  cartLineSchema,
} from '@zayqora/contracts';
test('integer checkout rounding is deterministic across currency precisions', () => {
  assert.deepEqual(checkoutAmounts(2602, 825, 25), {
    subtotal: 2602,
    tax: 215,
    serviceCharge: 25,
    deliveryFee: 0,
    total: 2842,
  });
  assert.equal(checkoutAmounts(1, 5000, 0).tax, 1);
  assert.equal(checkoutAmounts(123, 0, 0).total, 123);
  assert.throws(() => checkoutAmounts(Number.MAX_SAFE_INTEGER, 10000, 0));
});
test('business settings and cart payloads reject unsafe limits and authoritative price fields', () => {
  assert.equal(
    commerceSettingsSchema.safeParse({
      ...defaultCommerceSettings,
      blackouts: [{ start: '2026-12-01T10:00:00+03:00', end: '2026-12-01T08:00:00Z' }],
    }).success,
    true
  );
  assert.equal(
    commerceSettingsSchema.safeParse({
      ...defaultCommerceSettings,
      blackouts: [{ start: '2026-12-01T08:00:00Z', end: '2026-12-01T10:00:00+03:00' }],
    }).success,
    false
  );
  assert.equal(
    commerceSettingsSchema.safeParse({ ...defaultCommerceSettings, capacity: 2, maxParty: 8 })
      .success,
    false
  );
  assert.equal(
    commerceSettingsSchema.safeParse({ ...defaultCommerceSettings, holdMinutes: 120 }).success,
    false
  );
  assert.equal(
    cartLineSchema.safeParse({
      itemId: '00000000-0000-4000-8000-000000000001',
      quantity: 1,
      options: [],
      price: 1,
    }).success,
    false
  );
});
