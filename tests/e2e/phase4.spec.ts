import { test, expect, type BrowserContext, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { defaultCommerceSettings } from '@zayqora/contracts';
const database =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:1234@127.0.0.1:5432/zayqora_test';
if (!new URL(database).pathname.endsWith('_test'))
  throw new Error('Dedicated test database required');
test.use({ timezoneId: 'UTC' });
test('Phase 4 daily service: staff, kitchen, QR visit, POS cash, stock, coupon, reviews and delivery', async ({
  page,
  browser,
}) => {
  test.setTimeout(360000);
  const db = new Client({ connectionString: database });
  await db.connect();
  const stamp = Date.now();
  const email = `ops-${stamp}@example.com`,
    chefEmail = `chef-${stamp}@example.com`,
    riderEmail = `rider-${stamp}@example.com`;
  async function account(request: APIRequestContext, email: string) {
    const r = await request.post('/api/v1/auth/register', {
      data: { email, password: 'Password123!', full_name: 'Operations User' },
    });
    expect(r.status(), await r.text()).toBe(201);
    const emails = (await (await request.get('/api/v1/dev/emails?email=' + email)).json()).emails;
    const token = emails.at(-1).text.match(/token=([a-f0-9]+)/)[1];
    expect(
      (await request.post('/api/v1/auth/verify-email', { data: { token } })).ok()
    ).toBeTruthy();
    await request.post('/api/v1/auth/login', { data: { email, password: 'Password123!' } });
    return (await r.json()).user.id;
  }
  async function mutate(context: BrowserContext, path: string, data: any, method = 'POST') {
    const csrf = decodeURIComponent(
      (await context.cookies()).find((c) => c.name === 'zayqora_csrf')!.value
    );
    const r = await context.request.fetch('/api/v1' + path, {
      method,
      headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID() },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  const ownerId = await account(page.request, email);
  const restaurant = (
    await mutate(page.context(), '/restaurants', {
      name: 'Daily Service Lab',
      slug: `daily-${stamp}`,
      category: 'Cafe',
      phone: '+251911234567',
      email,
      country: 'Ethiopia',
      city: 'Addis Ababa',
      address: 'Bole Road',
      currency: 'USD',
      timezone: 'UTC',
    })
  ).restaurant;
  const id = restaurant.id,
    base = `/ops/${id}`;
  const draft = (await (await page.request.get(`/api/v1/restaurants/${id}/website/draft`)).json())
    .draft;
  const csrf = decodeURIComponent(
    (await page.context().cookies()).find((c) => c.name === 'zayqora_csrf')!.value
  );
  const media = await page.request.post(`/api/v1/restaurants/${id}/media`, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Image-Alt': 'Development service test image',
      'X-CSRF-Token': csrf,
    },
    data: await sharp({ create: { width: 900, height: 600, channels: 3, background: '#315947' } })
      .png()
      .toBuffer(),
  });
  expect(media.status()).toBe(201);
  const category = randomUUID(),
    item = randomUUID();
  draft.settings.description = 'Development-only operations fixture';
  draft.settings.cover = (await media.json()).id;
  draft.settings.serviceModes = ['takeaway', 'dine_in', 'delivery'];
  draft.settings.hours.week = Array.from({ length: 7 }, () => [
    { start: 0, end: 720 },
    { start: 720, end: 0 },
  ]);
  draft.categories = [
    { id: category, name: 'Kitchen', description: '', image: null, order: 0, active: true },
  ];
  draft.items = [
    {
      id: item,
      categoryId: category,
      name: 'Service bowl',
      description: 'Prepared to order',
      image: null,
      price: 1000,
      preparationMinutes: 10,
      featured: true,
      dietary: '',
      allergens: 'Sesame',
      state: 'active',
      variants: [],
      modifiers: [],
    },
  ];
  await mutate(page.context(), `/restaurants/${id}/website/draft`, { version: 0, draft }, 'PATCH');
  await mutate(page.context(), `/restaurants/${id}/website/publish`, { version: 1 });
  await db.query(
    "INSERT INTO tenant_subscriptions(restaurant_id,plan_code,status) VALUES($1,'pilot','manual')",
    [id]
  );
  await db.query('INSERT INTO commerce_settings(restaurant_id,content) VALUES($1,$2)', [
    id,
    {
      ...defaultCommerceSettings,
      enabled: true,
      reservations: true,
      leadMinutes: 0,
      capacity: 20,
      maxParty: 8,
    },
  ]);
  const branch = (
    await db.query('SELECT id FROM branches WHERE restaurant_id=$1 AND is_default', [id])
  ).rows[0].id;
  expect(branch).toBeTruthy();
  const station1 = await mutate(page.context(), base + '/kitchen/stations', { name: 'Grill' }),
    station2 = await mutate(page.context(), base + '/kitchen/stations', { name: 'Finishing' });
  await mutate(page.context(), base + '/kitchen/routing', {
    itemId: item,
    stationIds: [station1.id, station2.id],
  });
  const area = await mutate(page.context(), base + '/areas', { name: 'Dining room' }),
    table = await mutate(page.context(), base + '/tables', {
      areaId: area.id,
      name: 'Window 1',
      seats: 4,
    });
  const register = await mutate(page.context(), base + '/cash/registers', { name: 'Counter' });
  const location = await mutate(page.context(), base + '/inventory/locations', {
      name: 'Kitchen pantry',
    }),
    ingredient = await mutate(page.context(), base + '/inventory/ingredients', {
      name: 'Rice',
      unit: 'g',
      threshold: 10000,
    });
  await mutate(
    page.context(),
    base + '/settings',
    {
      kitchen: true,
      tables: true,
      pos: true,
      cash: true,
      delivery: true,
      inventory: true,
      coupons: true,
    },
    'PATCH'
  );
  await mutate(page.context(), base + '/inventory/movements', {
    ingredientId: ingredient.id,
    locationId: location.id,
    unit: 'g',
    quantity: 100000,
    kind: 'OPENING',
    reason: 'Development opening stock',
    key: 'opening-' + stamp,
  });
  await mutate(page.context(), base + '/inventory/recipes', {
    itemId: item,
    variantId: null,
    optionId: null,
    locationId: location.id,
    components: [{ ingredientId: ingredient.id, quantity: 1000 }],
  });
  const chef = await browser.newContext();
  const chefId = await account(chef.request, chefEmail);
  const chefPage = await chef.newPage();
  await page.goto(`/workspace/${id}/staff`);
  const invitation = page.getByRole('heading', { name: 'Invite a staff member' }).locator('..');
  await invitation.getByLabel('Email', { exact: true }).fill(chefEmail);
  await invitation.getByLabel('Role', { exact: true }).selectOption('chef');
  await invitation.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(invitation.getByRole('status')).toHaveText('Saved.');
  const invite = (
    await db.query(
      "SELECT payload FROM outbox_events WHERE restaurant_id=$1 AND kind='staff.invitation' ORDER BY created_at DESC LIMIT 1",
      [id]
    )
  ).rows[0].payload.invitationUrl;
  await chefPage.goto(invite);
  await chefPage.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(chefPage).toHaveURL(`/operations/${id}/kitchen`);
  const chefMembership = (
    await db.query('SELECT id FROM restaurant_memberships WHERE restaurant_id=$1 AND user_id=$2', [
      id,
      chefId,
    ])
  ).rows[0].id;
  for (const s of [station1, station2])
    await mutate(page.context(), base + '/kitchen/access', {
      membershipId: chefMembership,
      stationId: s.id,
    });
  const cashSession = await mutate(page.context(), base + '/cash/sessions', {
    registerId: register.id,
    opening: 500,
  });
  // Online order enters the same kitchen workflow.
  const guest = await browser.newContext();
  async function shop(context: BrowserContext, path: string, data?: any, key?: string) {
    const s = await (await context.request.get(`/api/v1/commerce/${id}/session`)).json();
    const accountCsrf = (await context.cookies()).find((c) => c.name === 'zayqora_csrf');
    const r = await context.request.fetch(`/api/v1/commerce/${id}${path}`, {
      method: data ? 'POST' : 'GET',
      headers: {
        'X-Guest-CSRF': s.csrf,
        ...(accountCsrf ? { 'X-CSRF-Token': decodeURIComponent(accountCsrf.value) } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  async function guestOrder(context: BrowserContext, ctx: any = {}, method = 'pay_at_pickup') {
    await shop(context, '/context', ctx);
    const cart = await shop(context, '/cart');
    const s = await (await context.request.get(`/api/v1/commerce/${id}/session`)).json();
    const r = await context.request.patch(`/api/v1/commerce/${id}/cart`, {
      headers: { 'X-Guest-CSRF': s.csrf },
      data: { version: cart.version, line: { itemId: item, options: [], quantity: 1 } },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    const quote = await shop(context, '/quotes', {});
    return shop(
      context,
      '/orders',
      {
        quoteId: quote.id,
        contact: { name: 'Diner Guest', email: 'diner@example.com', phone: '+251911111111' },
        method,
      },
      randomUUID()
    );
  }
  async function state(orderId: string, status: string) {
    const o = (await db.query('SELECT version FROM orders WHERE id=$1', [orderId])).rows[0];
    return mutate(
      page.context(),
      `/operations/${id}/orders/${orderId}`,
      {
        version: o.version,
        status,
        reason: 'Browser service journey',
      },
      'PATCH'
    );
  }
  async function finishKitchen(orderId: string) {
    await chefPage.reload();
    const order = (await db.query('SELECT reference FROM orders WHERE id=$1', [orderId])).rows[0];
    const cards = chefPage
      .locator('.kitchen-card')
      .filter({ has: chefPage.getByRole('heading', { name: order.reference, exact: true }) });
    await expect(cards).toHaveCount(2);
    const workIds = await cards.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('data-testid')!)
    );
    for (const workId of workIds) {
      const card = chefPage.getByTestId(workId);
      await card.getByRole('button', { name: 'Start preparation', exact: true }).click();
      await expect(
        card.getByRole('button', { name: 'Mark work ready', exact: true })
      ).toBeVisible();
      await card.getByRole('button', { name: 'Mark work ready', exact: true }).click();
      await expect(card.locator('strong').filter({ hasText: 'READY' })).toBeVisible();
    }
    await expect
      .poll(
        async () =>
          (await db.query('SELECT status FROM orders WHERE id=$1', [orderId])).rows[0].status
      )
      .toBe('READY');
  }
  const online = await guestOrder(guest);
  await state(online.id, 'CONFIRMED');
  await finishKitchen(online.id);
  await mutate(page.context(), base + '/cash/sessions/' + cashSession.id, {
    action: 'SALE',
    orderId: online.id,
    key: 'sale:' + online.id,
    reason: 'Cash received',
  });
  await state(online.id, 'COMPLETED');
  // Walk-in QR activation isolates diners and additional orders remain separate.
  await page.goto(`/operations/${id}/tables`);
  const tableCard = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Window 1 · 4 seats', exact: true }) });
  const seating = tableCard.getByRole('heading', { name: 'Seat guests' }).locator('..');
  await seating.getByLabel('Party size').fill('2');
  await seating
    .getByLabel('Expected departure')
    .fill(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  await seating.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Activation code:', { exact: false })).toBeVisible();
  const activation = await page
    .getByText('Activation code:', { exact: false })
    .locator('strong')
    .innerText();
  const session = (
    await db.query("SELECT * FROM service_sessions WHERE table_id=$1 AND status='OPEN'", [table.id])
  ).rows[0];
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await tableCard.getByRole('button', { name: 'Rotate printed QR reference' }).click();
  await expect(page.getByAltText('Scannable table QR code')).toBeVisible();
  const reference = await page.locator('a[href^="/table/"]').getAttribute('href');
  const diner = await guest.newPage();
  await diner.goto(reference!);
  await diner.getByLabel('Visit activation code').fill(activation);
  await diner.getByRole('button', { name: 'Join this visit' }).click();
  await diner.getByRole('button', { name: 'Add Service bowl', exact: true }).click();
  await expect(diner.getByRole('heading', { name: '1 × Service bowl' })).toBeVisible();
  await diner.getByRole('button', { name: 'Calculate server quote' }).click();
  await diner.getByLabel('Customer name').fill('Table Diner');
  await diner.getByLabel('Customer email').fill('table@example.com');
  await diner.getByLabel('Customer phone').fill('+251911111111');
  await diner.getByRole('button', { name: 'Submit table order' }).click();
  await expect(diner.getByRole('heading', { name: /Receipt ·/ })).toBeVisible();
  const qrOrder = (
    await db.query('SELECT order_id FROM session_orders WHERE service_session_id=$1', [session.id])
  ).rows[0].order_id;
  await state(qrOrder, 'CONFIRMED');
  await finishKitchen(qrOrder);
  await mutate(page.context(), base + '/cash/sessions/' + cashSession.id, {
    action: 'SALE',
    orderId: qrOrder,
    key: 'sale:' + qrOrder,
    reason: 'Table order settled',
  });
  await state(qrOrder, 'COMPLETED');
  await mutate(page.context(), base + '/visits/' + session.id, {
    version: 0,
    action: 'close',
    reason: 'Settled visit closed',
  });
  // POS with coupon reuses pricing, then reserves/consumes stock through the same work.
  await mutate(page.context(), base + '/coupons', {
    code: 'SERVICE10',
    kind: 'percent',
    value: 1000,
    minimum: 0,
    maximum: 0,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    limit: 10,
    perCustomer: 0,
    itemIds: [],
    categoryIds: [],
    modes: ['pickup'],
    active: true,
  });
  await page.goto(`/operations/${id}/pos`);
  await page.getByRole('button', { name: 'Add Service bowl', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 × Service bowl' })).toBeVisible();
  await page.getByLabel('Coupon', { exact: true }).fill('SERVICE10');
  await page.getByRole('button', { name: 'Calculate server quote' }).click();
  await page.getByLabel('Customer name').fill('Counter Guest');
  await page.getByLabel('Customer email').fill('counter@example.com');
  await page.getByLabel('Customer phone').fill('+251911111111');
  await page.getByRole('button', { name: 'Submit POS order' }).click();
  await expect(page.getByRole('heading', { name: /Receipt ·/ })).toBeVisible();
  const pos = (
    await db.query(
      "SELECT * FROM orders WHERE restaurant_id=$1 AND snapshot->>'channel'='pos' ORDER BY created_at DESC LIMIT 1",
      [id]
    )
  ).rows[0];
  expect(pos.status).toBe('CONFIRMED');
  expect(pos.snapshot.discount).toBe(100);
  await finishKitchen(pos.id);
  await mutate(page.context(), base + '/cash/sessions/' + cashSession.id, {
    action: 'SALE',
    orderId: pos.id,
    key: 'sale:' + pos.id,
    reason: 'Counter collection',
  });
  await state(pos.id, 'COMPLETED');
  const refundItem = (await db.query('SELECT id FROM order_items WHERE order_id=$1', [pos.id]))
    .rows[0].id;
  const allocatedRefund = await mutate(page.context(), base + '/refunds/lines', {
    orderId: pos.id,
    lines: [{ orderItemId: refundItem, quantity: 1 }],
    reason: 'Refund original discounted item',
  });
  expect(Number(allocatedRefund.amount)).toBe(900);
  await mutate(page.context(), base + '/cash/sessions/' + cashSession.id, {
    action: 'REFUND',
    refundId: allocatedRefund.id,
    key: 'refund:' + allocatedRefund.id,
    reason: 'Approved refund cash disbursed',
  });
  // Accepted cancellation releases reserved ingredients; prepared stock remains consumed.
  const cancelled = await guestOrder(guest);
  await state(cancelled.id, 'CONFIRMED');
  await state(cancelled.id, 'CANCELLED');
  const balances = (
    await db.query('SELECT * FROM stock_balances WHERE ingredient_id=$1', [ingredient.id])
  ).rows[0];
  expect(Number(balances.quantity)).toBe(97000);
  expect(Number(balances.reserved)).toBe(0);
  // Guest review requires its single-use invitation.
  await mutate(page.context(), base + '/reviews/invitations', { orderId: online.id });
  const reviewUrl = (
    await db.query(
      "SELECT payload FROM outbox_events WHERE restaurant_id=$1 AND kind='review.invitation' ORDER BY created_at DESC LIMIT 1",
      [id]
    )
  ).rows[0].payload.reviewUrl;
  await diner.goto(reviewUrl);
  await diner.getByLabel('Rating', { exact: true }).selectOption('4');
  await diner
    .getByLabel('Your review', { exact: true })
    .fill('Good service and a carefully prepared bowl.');
  await diner.getByRole('button', { name: 'Publish verified review' }).click();
  await expect(diner.getByText('Your verified review was published. Thank you.')).toBeVisible();
  // Simulated prepaid delivery; no production merchant or cash-on-delivery claim.
  const rider = await browser.newContext();
  const riderId = await account(rider.request, riderEmail);
  const riderMember = (
    await db.query(
      'INSERT INTO restaurant_memberships(restaurant_id,user_id) VALUES($1,$2) RETURNING id',
      [id, riderId]
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO membership_roles SELECT $1,id FROM roles WHERE name='rider' AND restaurant_id IS NULL",
    [riderMember]
  );
  const zone = await mutate(page.context(), base + '/delivery/zones', {
    name: 'Bole',
    description: 'Bole Road service area',
    fee: 200,
    active: true,
  });
  const delivery = await guestOrder(
    guest,
    { mode: 'delivery', zoneId: zone.id, address: 'Bole Road 20, Addis Ababa' },
    'test_online'
  );
  await db.query(
    'INSERT INTO payment_transactions(restaurant_id,order_id,provider_reference,amount,currency) SELECT restaurant_id,id,$2,total,currency FROM orders WHERE id=$1',
    [delivery.id, 'test-browser-' + delivery.id]
  );
  await db.query("UPDATE orders SET payment_status='PAID',version=version+1 WHERE id=$1", [
    delivery.id,
  ]);
  await state(delivery.id, 'CONFIRMED');
  await finishKitchen(delivery.id);
  await mutate(page.context(), base + '/delivery/assign', {
    orderId: delivery.id,
    riderId,
    reason: 'Rider assigned for test',
  });
  const riderPage = await rider.newPage();
  await riderPage.setViewportSize({ width: 390, height: 844 });
  await riderPage.goto(`/operations/${id}/deliveries`);
  for (const next of ['ACCEPTED', 'PICKED_UP', 'EN_ROUTE', 'DELIVERED']) {
    const form = riderPage.getByRole('heading', { name: 'Update assigned delivery' }).locator('..');
    await form.getByLabel('Next milestone').selectOption(next);
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    if (next !== 'DELIVERED')
      await expect(
        riderPage.getByRole('heading', { name: new RegExp(next) }).first()
      ).toBeVisible();
    else await expect(riderPage.getByText('No active deliveries assigned to you.')).toBeVisible();
  }
  // Cash reconciliation, private export and real responsive screens.
  const cashState = await (
    await page.request.get('/api/v1' + base + '/cash/sessions/' + cashSession.id)
  ).json();
  await mutate(page.context(), base + '/cash/sessions/' + cashSession.id, {
    action: 'close',
    counted: cashState.expectedCurrent,
    reason: 'End of service counted',
  });
  expect(
    (await db.query('SELECT variance FROM cash_sessions WHERE id=$1', [cashSession.id])).rows[0]
      .variance
  ).toBe('0');
  for (const [width, height, screen] of [
    [390, 844, 'tables'],
    [768, 1024, 'kitchen'],
    [1440, 1000, 'inventory'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`/operations/${id}/${screen}`);
    await expect(
      page.getByRole('heading', {
        name: screen === 'tables' ? 'Tables' : screen === 'kitchen' ? 'Kitchen' : 'Inventory',
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByRole('status').first()).toContainText('Connected');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({ path: `test-results/phase4-${screen}-${width}.png`, fullPage: true });
  }
  // Revocation blocks the next display poll and clears protected cards.
  await db.query("UPDATE restaurant_memberships SET status='revoked' WHERE id=$1", [
    chefMembership,
  ]);
  await chefPage.reload();
  await expect(chefPage.locator('main').getByRole('alert')).toContainText('denied');
  await expect(chefPage.locator('.kitchen-card')).toHaveCount(0);
  await db.end();
  await chef.close();
  await guest.close();
  await rider.close();
  expect(ownerId).toBeTruthy();
});
