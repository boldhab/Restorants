import { test, expect } from '@playwright/test';
import sharp from 'sharp';
test('owner setup, menu, private preview, publication and visitor lifecycle at three screen sizes', async ({
  page,
  browser,
}) => {
  const email = `phase2-${Date.now()}@example.com`,
    slug = `phase2-${Date.now()}`;
  await page.request.post('/api/v1/auth/register', {
    data: { email, password: 'Password123!', full_name: 'Website Owner' },
  });
  const inbox = await (await page.request.get(`/api/v1/dev/emails?email=${email}`)).json();
  const token = inbox.emails[0].text.match(/token=([a-f0-9]+)/)[1];
  expect(
    (await page.request.post('/api/v1/auth/verify-email', { data: { token } })).ok()
  ).toBeTruthy();
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  await expect(page).toHaveURL('/restaurants');
  const csrf = decodeURIComponent(
    (await page.context().cookies()).find((c) => c.name === 'zayqora_csrf')!.value
  );
  const headers = { 'X-CSRF-Token': csrf };
  const created = await page.request.post('/api/v1/restaurants', {
    headers,
    data: {
      name: 'Browser Coffee House',
      slug,
      category: 'Cafe',
      phone: '+251911123456',
      email,
      country: 'Ethiopia',
      city: 'Addis Ababa',
      address: 'Bole Road',
      currency: 'ETB',
      timezone: 'Africa/Addis_Ababa',
    },
  });
  expect(created.status()).toBe(201);
  const restaurant = (await created.json()).restaurant,
    base = `/api/v1/restaurants/${restaurant.id}`;
  await page.goto(`/workspace/${restaurant.id}/website`);
  await page
    .getByLabel('Description', { exact: true })
    .fill('A neighborhood coffee house with fresh pastries.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('All changes saved');
  await page.reload();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'A neighborhood coffee house with fresh pastries.'
  );
  await page.getByRole('button', { name: '2. Hours', exact: true }).click();
  await page.getByRole('button', { name: 'Add interval', exact: true }).first().click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('All changes saved');
  await page.getByRole('button', { name: '3. Images', exact: true }).click();
  await page.getByLabel('Describe the image').fill('A welcoming coffee house');
  const image = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#365643' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel('Upload image', { exact: true })
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByRole('status')).toContainText('Image uploaded');
  await page
    .getByLabel('Cover image', { exact: true })
    .selectOption({ label: 'A welcoming coffee house' });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('All changes saved');
  await page.getByRole('button', { name: '4. Categories', exact: true }).click();
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Coffee');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('All changes saved');
  await page.getByRole('button', { name: '5. Items', exact: true }).click();
  await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
  await page.locator('summary').click();
  await page.getByLabel('Item name', { exact: true }).fill('House coffee');
  await page.getByLabel('Base price').fill('1000');
  await page.getByLabel('State', { exact: true }).selectOption('active');
  await page
    .getByLabel('Dish image', { exact: true })
    .selectOption({ label: 'A welcoming coffee house' });
  await page.getByRole('button', { name: 'Add variant', exact: true }).click();
  await page.getByLabel('Variant name', { exact: true }).fill('Large');
  await page.getByLabel('Replacement price').fill('1200');
  await page.getByRole('button', { name: 'Add modifier group', exact: true }).click();
  await page.getByLabel('Option name', { exact: true }).fill('Oat milk');
  await page.getByLabel('Price addition').fill('100');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('All changes saved');
  await page.getByRole('button', { name: '7. Preview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Private preview · saved draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await expect(page.locator('.preview-frame')).toHaveCSS('width', '390px');
  await page.getByRole('button', { name: '8. Publish', exact: true }).click();
  await page.getByRole('button', { name: 'Publish saved draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Website published');
  const visitor = await browser.newContext();
  const publicPage = await visitor.newPage();
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await publicPage.setViewportSize({ width, height });
    await publicPage.goto(`/r/${slug}`);
    await expect(
      publicPage.getByRole('heading', { name: 'Browser Coffee House', exact: true })
    ).toBeVisible();
    expect(
      await publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBeTruthy();
    await expect
      .poll(() =>
        publicPage.locator('.hero-photo').evaluate((img: HTMLImageElement) => img.naturalWidth)
      )
      .toBeGreaterThan(0);
    await publicPage.screenshot({ path: `test-results/phase2-${width}.png`, fullPage: true });
  }
  await publicPage.goto(`/r/${slug}/menu`);
  await publicPage.getByLabel('Search dishes').fill('absent');
  await expect(publicPage.getByText('No matching dishes.')).toBeVisible();
  await publicPage.getByLabel('Search dishes').fill('coffee');
  await publicPage.getByRole('button', { name: 'View dish', exact: true }).click();
  await expect(publicPage.getByRole('dialog')).toBeVisible();
  await publicPage.getByLabel('Choose a variant').selectOption({ label: 'Large — ETB 12.00' });
  await publicPage.getByRole('checkbox', { name: /Oat milk/ }).check();
  await publicPage.getByRole('button', { name: 'Validate menu pricing', exact: true }).click();
  await expect(publicPage.getByRole('status')).toContainText('13.00');
  await publicPage.keyboard.press('Escape');
  await expect(publicPage.getByRole('dialog')).not.toBeVisible();
  headers['X-CSRF-Token'] = decodeURIComponent(
    (await page.context().cookies()).find((c) => c.name === 'zayqora_csrf')!.value
  );
  const saved = await (await page.request.get(`${base}/website/draft`)).json();
  saved.draft.items[0].price = 2000;
  expect(
    (
      await page.request.patch(`${base}/website/draft`, {
        headers,
        data: { version: saved.version, draft: saved.draft },
      })
    ).ok()
  ).toBeTruthy();
  expect(
    (await (await visitor.request.get(`/api/v1/public/restaurants/${slug}`)).json()).draft.items[0]
      .price
  ).toBe(1000);
  expect(
    (
      await page.request.post(`${base}/website/publish`, {
        headers,
        data: { version: saved.version + 1 },
      })
    ).ok()
  ).toBeTruthy();
  expect(
    (await (await visitor.request.get(`/api/v1/public/restaurants/${slug}`)).json()).draft.items[0]
      .price
  ).toBe(2000);
  expect(
    (
      await page.request.patch(`${base}/menu/items/${saved.draft.items[0].id}/availability`, {
        headers,
        data: { soldOut: true, enabled: true, serviceModes: ['dine_in'], hours: null },
      })
    ).ok()
  ).toBeTruthy();
  await publicPage.reload();
  await expect(publicPage.getByText('Sold out', { exact: true })).toBeVisible();
  const unpublished = await page.request.post(`${base}/website/unpublish`, {
    headers,
    data: { version: saved.version + 1 },
  });
  expect(unpublished.ok()).toBeTruthy();
  expect((await visitor.request.get(`/api/v1/public/restaurants/${slug}`)).status()).toBe(404);
  expect((await publicPage.goto(`/r/${slug}`))!.status()).toBe(404);
  await visitor.close();
});
