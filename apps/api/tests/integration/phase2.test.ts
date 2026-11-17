import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { app, pool, resetTestDatabase } from '../helpers/test-app.js';
import { restaurantsService } from '../../src/modules/restaurants/restaurants.service.js';
import * as service from '../../src/modules/publishing/publishing.service.js';
import * as media from '../../src/modules/publishing/media.service.js';
import { configurationPrice } from '@zayqora/contracts';
test('Phase 2 real PostgreSQL lifecycle, publication isolation, media, concurrency, tenant security and suspension', async () => {
  await resetTestDatabase();
  const register = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'phase2@example.com', full_name: 'Phase Two Owner', password: 'Password123!' });
  assert.equal(register.status, 201);
  const actor = register.body.user.id;
  await pool.query('UPDATE users SET is_email_verified=true WHERE id=$1', [actor]);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'phase2@example.com', password: 'Password123!' });
  const cookies = login.headers['set-cookie'];
  const csrf = login.body.csrfToken;
  async function restaurant(slug: string) {
    const r = await restaurantsService.createRestaurant(actor, {
      name: slug,
      slug,
      category: 'Cafe',
      email: 'phase2@example.com',
      phone: '+251911222333',
      country: 'Ethiopia',
      city: 'Addis Ababa',
      address: 'Bole Road',
      timezone: 'Africa/Addis_Ababa',
      currency: 'ETB',
    });
    return r.body.restaurant.id as string;
  }
  const a = await restaurant('coffee-house'),
    b = await restaurant('garden-bistro');
  const initial = await service.readDraft(a);
  const d = initial.draft;
  await assert.rejects(
    media.uploadImage(a, Buffer.from('<svg onload="alert(1)"/>'), 'Bad'),
    /valid/
  );
  const bytes = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#557755' },
  })
    .png()
    .toBuffer();
  const image = await media.uploadImage(a, bytes, 'A green dining room');
  d.settings.cover = image.id;
  d.settings.description = 'Fresh coffee in Addis Ababa';
  d.settings.hours.week = Array.from({ length: 7 }, () => [{ start: 0, end: 1439 }]);
  const category = randomUUID(),
    item = randomUUID(),
    variant = randomUUID(),
    option = randomUUID();
  d.categories = [
    {
      id: category,
      name: 'Coffee',
      description: 'Brewed daily',
      image: null,
      active: true,
      order: 0,
    },
  ];
  d.items = [
    {
      id: item,
      categoryId: category,
      name: 'Coffee',
      description: 'House roast',
      image: image.id,
      price: 1000,
      preparationMinutes: 5,
      featured: true,
      dietary: '',
      allergens: 'Milk',
      state: 'active',
      variants: [{ id: variant, name: 'Large', price: 1200 }],
      modifiers: [
        {
          id: randomUUID(),
          name: 'Milk',
          min: 1,
          max: 1,
          options: [{ id: option, name: 'Oat', price: 101, available: true }],
        },
      ],
    },
  ];
  assert.equal(configurationPrice(d.items[0], variant, [option]), 1301);
  await service.saveDraft(a, 0, d);
  const categoriesResponse = await request(app)
    .get(`/api/v1/restaurants/${a}/menu/categories?limit=1&offset=0`)
    .set('Cookie', cookies);
  assert.equal(categoriesResponse.status, 200);
  assert.equal(categoriesResponse.body.categories[0].id, category);
  const settingsResponse = await request(app)
    .get(`/api/v1/restaurants/${a}/settings`)
    .set('Cookie', cookies);
  assert.equal(settingsResponse.status, 200);
  assert.equal(settingsResponse.body.version, 1);
  await assert.rejects(
    media.uploadImage(a, Buffer.alloc(5 * 1024 * 1024 + 1), 'Too large'),
    /5 MB/
  );

  const privateImage = await request(app).get(
    `/api/v1/public/restaurants/coffee-house/media/${image.id}`
  );
  assert.equal(privateImage.status, 404);
  const before = await request(app).get('/api/v1/public/restaurants/coffee-house');
  assert.equal(before.status, 404);
  const privatePreview = await request(app).get(`/api/v1/restaurants/${a}/website/preview`);
  assert.equal(privatePreview.status, 401);
  const preview = await request(app)
    .get(`/api/v1/restaurants/${a}/website/preview`)
    .set('Cookie', cookies);
  assert.equal(preview.status, 200);
  assert.match(preview.headers['cache-control'], /no-store/);
  const [published, retry] = await Promise.all([
    service.publish(a, 1, actor),
    service.publish(a, 1, actor),
  ]);
  assert.equal(published.revision, retry.revision);
  const publicRes = await request(app).get('/api/v1/public/restaurants/coffee-house');
  assert.equal(publicRes.status, 200);
  assert.equal(publicRes.body.restaurant_id, undefined);
  assert.equal(publicRes.body.draft.items[0].price, 1000);
  assert.match(publicRes.headers['cache-control'], /no-store/);
  assert.equal(
    (
      await service.validateConfiguration('coffee-house', {
        revision: published.revision,
        itemId: item,
        variantId: variant,
        options: [option],
      })
    ).price,
    1301
  );
  d.items[0].price = 2000;
  await service.saveDraft(a, 1, d);
  assert.equal((await service.publicWebsite('coffee-house')).draft.items[0].price, 1000);
  await assert.rejects(service.publish(a, 1, actor), /changed/);
  await assert.rejects(service.saveDraft(a, 1, d), /Newer/);
  const foreign = await service.readDraft(b);
  foreign.draft.settings.cover = image.id;
  await assert.rejects(service.saveDraft(b, 0, foreign.draft), /another restaurant/);
  await assert.rejects(media.deleteImage(b, image.id), /not found/);
  await assert.rejects(media.imageBytes(image.id, b), /not found/);
  await assert.rejects(media.deleteImage(a, image.id), /Detach/);
  const next = await service.publish(a, 2, actor);
  assert.notEqual(next.revision, published.revision);
  assert.equal((await service.publicWebsite('coffee-house')).draft.items[0].price, 2000);
  await assert.rejects(
    service.validateConfiguration('coffee-house', {
      revision: published.revision,
      itemId: item,
      variantId: variant,
      options: [option],
    }),
    /Refresh/
  );
  await service.setAvailability(a, item, {
    soldOut: true,
    enabled: true,
    serviceModes: ['dine_in'],
    hours: null,
  });
  assert.equal((await service.publicWebsite('coffee-house')).availability[item].soldOut, true);
  await assert.rejects(
    service.validateConfiguration('coffee-house', {
      revision: next.revision,
      itemId: item,
      variantId: variant,
      options: [option],
    }),
    /unavailable/
  );
  await pool.query("UPDATE restaurants SET status='suspended' WHERE id=$1", [a]);
  await assert.rejects(service.publicWebsite('coffee-house'), /not found/);
  await assert.rejects(media.imageBytes(image.id, undefined, 'coffee-house'), /not found/);
  await pool.query("UPDATE restaurants SET status='active' WHERE id=$1", [a]);
  await service.unpublish(a, 2, actor);
  await assert.rejects(service.publicWebsite('coffee-house'), /not found/);
  await assert.rejects(
    pool.query("UPDATE restaurants SET currency='USD' WHERE id=$1", [a]),
    /Currency/
  );
  const count = (
    await pool.query('SELECT count(*) FROM menu_price_history WHERE restaurant_id=$1', [a])
  ).rows[0].count;
  assert.equal(count, '2');
  // A user who does not belong to a restaurant cannot read its draft.
  const outsider = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'outsider@example.com', full_name: 'Other Owner', password: 'Password123!' });
  await pool.query('UPDATE users SET is_email_verified=true WHERE id=$1', [outsider.body.user.id]);
  const other = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'outsider@example.com', password: 'Password123!' });
  assert.equal(
    (
      await request(app)
        .get(`/api/v1/restaurants/${a}/website/draft`)
        .set('Cookie', other.headers['set-cookie'])
    ).status,
    403
  );
  const noCsrf = await request(app)
    .post(`/api/v1/restaurants/${a}/website/publish`)
    .set('Cookie', cookies)
    .send({ version: 2 });
  assert.equal(noCsrf.status, 403);
  const validCsrf = await request(app)
    .post(`/api/v1/restaurants/${a}/website/publish`)
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrf)
    .send({ version: 2 });
  assert.equal(validCsrf.status, 200);
});
