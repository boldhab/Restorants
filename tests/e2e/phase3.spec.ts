import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { Client } from 'pg';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { defaultCommerceSettings } from '@zayqora/contracts';
test('controlled pilot: platform entitlement, guest pickup, staff completion, refund, reservation, account history', async ({
  page,
  browser,
}) => {
  test.setTimeout(300000);
  const stamp = Date.now(),
    slug = `pilot-${stamp}`,
    ownerEmail = `pilot-owner-${stamp}@example.com`,
    adminEmail = `pilot-admin-${stamp}@example.com`,
    customerEmail = `pilot-customer-${stamp}@example.com`;
  async function account(request: APIRequestContext, email: string) {
    const r = await request.post('/api/v1/auth/register', {
      data: { email, password: 'Password123!', full_name: 'Pilot Test User' },
    });
    expect(r.status()).toBe(201);
    const emails = (await (await request.get(`/api/v1/dev/emails?email=${email}`)).json()).emails;
    const token = emails.at(-1).text.match(/token=([a-f0-9]+)/)[1];
    expect(
      (await request.post('/api/v1/auth/verify-email', { data: { token } })).ok()
    ).toBeTruthy();
    return (await r.json()).user.id;
  }
  await account(page.request, ownerEmail);
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ownerEmail);
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  await expect(page).toHaveURL('/restaurants');
  async function mutate(context: BrowserContext, url: string, data: any, method = 'POST') {
    const csrf = decodeURIComponent(
      (await context.cookies()).find((c) => c.name === 'zayqora_csrf')!.value
    );
    const r = await context.request.fetch('/api/v1' + url, {
      method,
      headers: { 'X-CSRF-Token': csrf },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  const r = await mutate(page.context(), '/restaurants', {
      name: 'Pilot Coffee House',
      slug,
      category: 'Cafe',
      phone: '+251911234567',
      email: ownerEmail,
      country: 'Ethiopia',
      city: 'Addis Ababa',
      address: 'Bole Road',
      currency: 'ETB',
      timezone: 'UTC',
    }),
    id = r.restaurant.id;
  const base = `/restaurants/${id}`;
  const saved = await (await page.request.get('/api/v1' + base + '/website/draft')).json();
  const csrf = decodeURIComponent(
    (await page.context().cookies()).find((c) => c.name === 'zayqora_csrf')!.value
  );
  const cover = await page.request.post('/api/v1' + base + '/media', {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Image-Alt': 'Pilot fixture swatch',
      'X-CSRF-Token': csrf,
    },
    data: await sharp({ create: { width: 900, height: 600, channels: 3, background: '#365743' } })
      .png()
      .toBuffer(),
  });
  expect(cover.status()).toBe(201);
  const d = saved.draft;
  d.settings.description = 'Development-only controlled pilot fixture.';
  d.settings.cover = (await cover.json()).id;
  d.settings.serviceModes = ['takeaway'];
  d.settings.hours.week = Array.from({ length: 7 }, () => [
    { start: 0, end: 720 },
    { start: 720, end: 0 },
  ]);
  const category = randomUUID(),
    item = randomUUID(),
    variant = randomUUID(),
    option = randomUUID();
  d.categories = [
    { id: category, name: 'Coffee', description: '', image: null, order: 0, active: true },
  ];
  d.items = [
    {
      id: item,
      categoryId: category,
      name: 'Pilot coffee',
      description: 'A test dish',
      image: null,
      price: 1000,
      preparationMinutes: 0,
      featured: false,
      dietary: '',
      allergens: '',
      state: 'active',
      variants: [{ id: variant, name: 'Large', price: 1200 }],
      modifiers: [
        {
          id: randomUUID(),
          name: 'Milk',
          min: 1,
          max: 1,
          options: [{ id: option, name: 'Oat', price: 100, available: true }],
        },
      ],
    },
  ];
  await mutate(page.context(), base + '/website/draft', { version: 0, draft: d }, 'PATCH');
  await mutate(page.context(), base + '/website/publish', { version: 1 });
  const os = await (await page.request.get(`/api/v1/operations/${id}/settings`)).json();
  await mutate(
    page.context(),
    `/operations/${id}/settings`,
    {
      version: os.version,
      settings: {
        ...defaultCommerceSettings,
        enabled: true,
        reservations: true,
        leadMinutes: 0,
        taxBps: 1000,
        serviceCharge: 50,
      },
    },
    'PATCH'
  );
  expect((await page.request.get('/api/v1/platform/tenants')).status()).toBe(403);
  const guest = await browser.newContext(),
    visitor = await guest.newPage();
  await visitor.goto(`/r/${slug}/menu`);
  await visitor.getByRole('button', { name: 'View dish', exact: true }).click();
  await expect(
    visitor.getByRole('button', { name: 'Add to pickup cart', exact: true })
  ).toHaveCount(0);
  await visitor.keyboard.press('Escape');
  const admin = await browser.newContext();
  const adminId = await account(admin.request, adminEmail);
  const database =
    process.env.TEST_DATABASE_URL || 'postgres://postgres:1234@127.0.0.1:5432/zayqora_test';
  if (!new URL(database).pathname.endsWith('_test')) throw new Error('Dedicated test DB required');
  const db = new Client({ connectionString: database });
  await db.connect();
  await db.query('INSERT INTO platform_administrators(user_id) VALUES($1)', [adminId]);
  await db.end();
  const adminPage = await admin.newPage();
  await adminPage.goto('/login');
  await adminPage.getByLabel('Email address').fill(adminEmail);
  await adminPage.getByLabel('Password', { exact: true }).fill('Password123!');
  await adminPage.getByRole('button', { name: 'Sign in', exact: false }).click();
  await expect(adminPage).toHaveURL('/restaurants');
  await adminPage.goto('/platform');
  await adminPage.getByLabel('Mandatory action reason').fill('Controlled pilot browser fixture');
  const tenant = adminPage.locator('section').filter({ hasText: slug });
  await tenant.getByRole('button', { name: 'Assign Controlled pilot plan', exact: true }).click();
  await expect(adminPage.getByRole('status')).toContainText('recorded');
  async function addDish() {
    await visitor.goto(`/r/${slug}/menu`);
    await visitor.getByRole('button', { name: 'View dish', exact: true }).click();
    await visitor.getByLabel('Choose a variant').selectOption(variant);
    await visitor.getByRole('checkbox', { name: /Oat/ }).check();
    await visitor.getByRole('button', { name: 'Add to pickup cart', exact: true }).click();
    await expect(visitor.getByRole('status')).toContainText('Added to your pickup cart');
    await visitor.keyboard.press('Escape');
    await visitor.goto(`/shop/${id}/cart`);
  }
  async function responsive(p: Page, name: string) {
    for (const [width, height] of [
      [390, 844],
      [768, 1024],
      [1440, 1000],
    ]) {
      await p.setViewportSize({ width, height });
      expect(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      ).toBeTruthy();
      await p.screenshot({ path: `test-results/phase3-${name}-${width}.png`, fullPage: true });
    }
  }
  async function checkout(name: string, email: string, loseResponse = false) {
    await visitor.getByRole('button', { name: 'Calculate checkout quote', exact: true }).click();
    await expect(visitor.getByRole('heading', { name: 'Review your pickup order' })).toBeVisible();
    await responsive(visitor, 'checkout');
    await visitor.getByLabel('Contact name', { exact: true }).fill(name);
    await visitor.getByLabel('Contact email', { exact: true }).fill(email);
    await visitor.getByLabel('Contact phone', { exact: true }).fill('+251911234567');
    if (loseResponse)
      await visitor.route(
        `**/api/v1/commerce/${id}/orders`,
        async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          await route.abort('failed');
        },
        { times: 1 }
      );
    await visitor.getByRole('button', { name: 'Place pickup order', exact: true }).click();
    if (loseResponse) {
      const recover = visitor.getByRole('button', {
        name: 'Recover previous checkout submission',
        exact: true,
      });
      await expect(recover).toBeVisible();
      await expect(
        visitor.getByRole('button', { name: 'Place pickup order', exact: true })
      ).toBeEnabled();
      await visitor.getByLabel('Contact name', { exact: true }).fill('Changed while uncertain');
      await visitor.getByRole('button', { name: 'Place pickup order', exact: true }).click();
      await expect(visitor.getByRole('status')).toContainText('Recover the previous checkout');
      await recover.click();
    }

    await expect(visitor).toHaveURL(/\/orders\//);
    return (await visitor.getByRole('heading', { name: /Order ZQ-/ }).textContent())!.replace(
      'Order ',
      ''
    );
  }
  await addDish();
  await visitor.reload();
  await expect(visitor.getByRole('heading', { name: 'Pilot coffee', exact: true })).toBeVisible();
  const reference = await checkout('Guest Pilot', 'guest-pilot@example.com', true);
  const guestOrderUrl = visitor.url();
  const recovered = await (await guest.request.get(`/api/v1/commerce/${id}/orders`)).json();
  expect(recovered).toHaveLength(1);
  expect(recovered[0].contact.name).toBe('Guest Pilot');
  await visitor.reload();
  await expect(visitor.getByText('Fulfillment:', { exact: false })).toContainText('PENDING');
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await visitor.setViewportSize({ width, height });
    expect(
      await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBeTruthy();
    await visitor.screenshot({ path: `test-results/phase3-tracking-${width}.png`, fullPage: true });
  }
  await page.goto(`/workspace/${id}/operations`);
  await page.getByRole('button', { name: 'Open ' + reference, exact: true }).click();
  await page.getByLabel('Action reason', { exact: true }).fill('Pilot staff workflow');
  await responsive(page, 'operations');
  for (const status of ['CONFIRMED', 'PREPARING', 'READY']) {
    await page.getByRole('button', { name: status, exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Saved successfully');
  }
  await page
    .getByRole('button', { name: 'Record payment collected at pickup', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Saved successfully');
  await page.getByRole('button', { name: 'COMPLETED', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved successfully');
  await expect(visitor.getByText('Fulfillment:', { exact: false })).toContainText('COMPLETED');
  await page.getByLabel('Refund amount (minor units)').fill('200');
  await page.getByRole('button', { name: 'Request refund', exact: true }).click();
  await page.getByRole('button', { name: 'Record pickup refund handed back', exact: true }).click();
  await expect(visitor.getByText(/Refund .*CONFIRMED/)).toBeVisible();
  await visitor.goto(`/shop/${id}/reservations`);
  await visitor.getByRole('button', { name: 'Find available times', exact: true }).click();
  await expect(visitor.getByLabel('Reservation time').locator('option')).not.toHaveCount(1);
  await visitor.getByLabel('Reservation time').selectOption({ index: 1 });
  await responsive(visitor, 'reservations');
  await visitor.getByLabel('Contact name', { exact: true }).fill('Guest Pilot');
  await visitor.getByLabel('Contact email', { exact: true }).fill('guest-pilot@example.com');
  await visitor.getByLabel('Contact phone', { exact: true }).fill('+251911234567');
  await visitor.getByRole('button', { name: 'Request reservation', exact: true }).click();
  await expect(visitor.getByRole('status')).toContainText('Reservation requested');
  await page.getByRole('button', { name: 'Reservations', exact: true }).click();
  await page.getByRole('button', { name: 'CONFIRMED reservation', exact: true }).click();
  await expect(visitor.getByRole('heading', { name: /RS-.*CONFIRMED/ })).toBeVisible();
  await visitor.getByRole('button', { name: 'Cancel reservation', exact: true }).click();
  await expect(visitor.getByRole('heading', { name: /RS-.*CANCELLED/ })).toBeVisible();
  await account(guest.request, customerEmail);
  await visitor.goto('/login');
  await visitor.getByLabel('Email address').fill(customerEmail);
  await visitor.getByLabel('Password', { exact: true }).fill('Password123!');
  await visitor.getByRole('button', { name: 'Sign in', exact: false }).click();
  await expect(visitor).toHaveURL('/restaurants');
  await addDish();
  const accountReference = await checkout('Account Pilot', customerEmail);
  await visitor.goto('/customer/history');
  await expect(visitor.getByRole('link', { name: accountReference, exact: true })).toBeVisible();
  await expect(visitor.getByRole('link', { name: reference, exact: true })).toHaveCount(0);
  await visitor.goto(`/shop/${id}/profile`);
  await visitor.getByRole('button', { name: 'Load account preferences', exact: true }).click();
  await visitor.getByLabel('Name', { exact: true }).fill('Account Pilot');
  await visitor.getByLabel('Phone', { exact: true }).fill('+251911234567');
  await visitor.getByLabel('Saved addresses').fill('Home | Bole Road');
  await visitor.getByRole('button', { name: 'Save customer settings', exact: true }).click();
  await expect(visitor.getByRole('status')).toContainText('Preferences saved');
  // A cancellation keeps payment and refund states independent.
  await visitor.goto(`/shop/${id}/history`);
  await visitor.getByRole('link', { name: accountReference, exact: true }).click();
  await visitor.getByRole('button', { name: 'Request cancellation', exact: true }).click();
  await expect(visitor.getByText('Fulfillment:', { exact: false })).toContainText('CANCELLED');
  expect(guestOrderUrl).not.toContain('token');
  await guest.close();
  await admin.close();
});
