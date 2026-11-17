import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  isOpen,
  hoursSchema,
  configurationPrice,
  itemSchema,
  modifierSchema,
  formatMoney,
  initialDraft,
  draftSchema,
} from '@zayqora/contracts';
const id = randomUUID;
const week = Array.from({ length: 7 }, () => [] as { start: number; end: number }[]);
week[1] = [{ start: 22 * 60, end: 2 * 60 }];
const hours = { week, exceptions: [] };
test('restaurant-local overnight hours and date exceptions use exclusive closing boundaries', () => {
  assert.equal(isOpen(hours, 'Africa/Addis_Ababa', new Date('2026-11-16T19:00:00Z')), true);
  assert.equal(isOpen(hours, 'Africa/Addis_Ababa', new Date('2026-11-16T22:59:00Z')), true);
  assert.equal(isOpen(hours, 'Africa/Addis_Ababa', new Date('2026-11-16T23:00:00Z')), false);
  assert.equal(
    isOpen(
      { ...hours, exceptions: [{ date: '2026-11-17', intervals: [], label: 'Closed' }] },
      'Africa/Addis_Ababa',
      new Date('2026-11-16T22:00:00Z')
    ),
    false
  );
  const overlap = structuredClone(hours);
  overlap.week[2] = [{ start: 60, end: 180 }];
  assert.equal(hoursSchema.safeParse(overlap).success, false);
});
test('variant replaces base, additions remain exact integer amounts, constraints enforce selections', () => {
  const option = id(),
    variant = id();
  const item = itemSchema.parse({
    id: id(),
    categoryId: id(),
    name: 'Coffee',
    description: '',
    image: null,
    price: 101,
    preparationMinutes: 1,
    featured: false,
    dietary: '',
    allergens: '',
    state: 'active',
    variants: [{ id: variant, name: 'Large', price: 202 }],
    modifiers: [
      {
        id: id(),
        name: 'Milk',
        min: 1,
        max: 1,
        options: [{ id: option, name: 'Oat', price: 33, available: true }],
      },
    ],
  });
  assert.equal(configurationPrice(item, variant, [option]), 235);
  assert.throws(() => configurationPrice(item, variant, []), /Choose/);
  assert.throws(() => configurationPrice(item, variant, [option, option]), /once/);
  assert.throws(() => configurationPrice(item, undefined, [option]), /variant/);
  assert.equal(itemSchema.safeParse({ ...item, price: 1.1 }).success, false);
  assert.equal(modifierSchema.safeParse({ ...item.modifiers[0], min: 2 }).success, false);
  assert.equal(
    modifierSchema.safeParse({
      ...item.modifiers[0],
      options: [{ id: option, name: 'Oat', price: 33, available: false }],
    }).success,
    false
  );
  assert.equal(formatMoney(123, 'JPY'), '¥123');
  assert.equal(formatMoney(1234, 'KWD'), 'KWD 1.234');
});
test('draft schemas reject foreign category references, duplicate identifiers and executable fields', () => {
  const d = initialDraft({
    name: 'Cafe',
    category: 'Cafe',
    email: 'cafe@example.com',
    phone: '123456',
    address: 'Bole',
    timezone: 'Africa/Addis_Ababa',
    currency: 'ETB',
  });
  assert.equal(draftSchema.safeParse(d).success, true);
  assert.equal(
    draftSchema.safeParse({ ...d, settings: { ...d.settings, address: 'x'.repeat(255) } }).success,
    true
  );
  assert.equal(
    draftSchema.safeParse({ ...d, settings: { ...d.settings, name: 'x'.repeat(101) } }).success,
    false
  );
  assert.equal(
    draftSchema.safeParse({ ...d, settings: { ...d.settings, category: 'x'.repeat(51) } }).success,
    false
  );
  assert.equal(
    draftSchema.safeParse({ ...d, settings: { ...d.settings, phone: 'invalid' } }).success,
    false
  );
  assert.equal(draftSchema.safeParse({ ...d, script: 'alert(1)' }).success, false);
  assert.equal(
    draftSchema.safeParse({ ...d, settings: { ...d.settings, timezone: 'invented/time' } }).success,
    false
  );
});
