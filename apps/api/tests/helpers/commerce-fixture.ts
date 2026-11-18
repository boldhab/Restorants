import { randomUUID } from 'node:crypto';
import { pool, resetTestDatabase } from './test-app.js';
import { hashPassword } from '../../src/shared/security/passwords.js';
import { restaurantsService } from '../../src/modules/restaurants/restaurants.service.js';
import { readDraft, saveDraft, publish } from '../../src/modules/publishing/publishing.service.js';
import {
  createQuote,
  mutateCart,
  submitOrder,
  type Scope,
} from '../../src/modules/commerce/commerce.service.js';
import { defaultCommerceSettings } from '@zayqora/contracts';
const passwordHash = await hashPassword('Password123!');
export async function fixture() {
  await resetTestDatabase();
  async function user(label: string) {
    return (
      await pool.query(
        'INSERT INTO users(email,password_hash,full_name,is_email_verified) VALUES($1,$2,$3,true) RETURNING *',
        [label + '@example.com', passwordHash, label]
      )
    ).rows[0];
  }
  const owner = await user('commerce-owner'),
    customer = await user('commerce-customer'),
    other = await user('commerce-other'),
    staff = await user('commerce-staff');
  async function restaurant(slug: string, currency: string) {
    const created = await restaurantsService.createRestaurant(owner.id, {
      name: slug,
      slug,
      category: 'Cafe',
      phone: '+251911234567',
      email: owner.email,
      country: 'Ethiopia',
      city: 'Addis Ababa',
      address: 'Bole Road',
      timezone: 'UTC',
      currency,
    });
    const id = created.body.restaurant.id;
    const asset = (
      await pool.query(
        "INSERT INTO media_assets(restaurant_id,object_key,alt,width,height,bytes) VALUES($1,$2,'Test fixture',1,1,1) RETURNING id",
        [id, randomUUID() + '.webp']
      )
    ).rows[0].id;
    const d = (await readDraft(id)).draft;
    d.settings.description = 'Transaction test fixture';
    d.settings.cover = asset;
    d.settings.serviceModes = ['takeaway'];
    d.settings.hours.week = Array.from({ length: 7 }, () => [
      { start: 0, end: 720 },
      { start: 720, end: 0 },
    ]);
    const categoryId = randomUUID(),
      itemId = randomUUID(),
      variantId = randomUUID(),
      optionId = randomUUID();
    d.categories = [
      { id: categoryId, name: 'Coffee', description: '', image: null, order: 0, active: true },
    ];
    d.items = [
      {
        id: itemId,
        categoryId,
        name: 'House coffee',
        description: '',
        image: null,
        price: 1000,
        preparationMinutes: 15,
        featured: true,
        dietary: '',
        allergens: '',
        state: 'active',
        variants: [{ id: variantId, name: 'Large', price: 1200 }],
        modifiers: [
          {
            id: randomUUID(),
            name: 'Milk',
            min: 1,
            max: 1,
            options: [{ id: optionId, name: 'Oat', price: 101, available: true }],
          },
        ],
      },
    ];
    await saveDraft(id, 0, d);
    await publish(id, 1, owner.id);
    await pool.query(
      "INSERT INTO tenant_subscriptions(restaurant_id,plan_code,status) VALUES($1,'pilot','manual')",
      [id]
    );
    await pool.query('INSERT INTO commerce_settings(restaurant_id,content) VALUES($1,$2)', [
      id,
      {
        ...defaultCommerceSettings,
        enabled: true,
        reservations: true,
        taxBps: 825,
        serviceCharge: 25,
        leadMinutes: 0,
        capacity: 4,
        maxParty: 4,
      },
    ]);
    const member = (
      await pool.query(
        "INSERT INTO restaurant_memberships(restaurant_id,user_id,status) VALUES($1,$2,'active') RETURNING id",
        [id, staff.id]
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO membership_roles(membership_id,role_id) SELECT $1,id FROM roles WHERE name='staff' AND restaurant_id IS NULL",
      [member.id]
    );
    const session = (
      await pool.query(
        'INSERT INTO commerce_sessions(restaurant_id,token_hash) VALUES($1,$2) RETURNING id',
        [id, randomUUID()]
      )
    ).rows[0].id;
    const scope: Scope = { restaurantId: id, sessionId: session };
    return {
      id,
      slug,
      itemId,
      variantId,
      optionId,
      scope,
      draft: d,
      line: { itemId, variantId, options: [optionId], quantity: 2 },
    };
  }
  const a = await restaurant('alpha-cafe', 'USD'),
    b = await restaurant('beta-bistro', 'ETB');
  const contact = { name: 'Guest Customer', email: 'guest@example.com', phone: '+251911111111' };
  async function ready(scope = a.scope) {
    const row = await mutateCart(scope, 0, a.line);
    const quote = await createQuote(scope);
    return { row, quote, input: { quoteId: quote.id, contact, method: 'pay_at_pickup' } };
  }
  async function order(scope = a.scope, method = 'pay_at_pickup') {
    const { input } = await ready(scope);
    return submitOrder(scope, randomUUID(), { ...input, method }, true);
  }
  return { a, b, owner, customer, other, staff, contact, ready, order };
}
