import { test, expect } from '@playwright/test';
test('registration → verification → onboarding → settings → reload → logout', async ({
  page,
  request,
}) => {
  const email = `journey-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Journey Owner');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toContainText('Account created');
  const inbox = await request.get(`/api/v1/dev/emails?email=${email}`);
  const emails = (await inbox.json()).emails;
  const token = emails[0].text.match(/token=([a-f0-9]+)/)[1];
  await page.goto(`/verify-email?token=${token}`);
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  await expect(page).toHaveURL('/restaurants');
  await page.getByRole('link', { name: 'Create a restaurant' }).click();
  await page.getByLabel('Restaurant name', { exact: true }).fill('Journey Café');
  await page.getByLabel('Business category').fill('Café');
  await page.getByLabel('Contact email').fill(email);
  await page.getByLabel('Contact phone').fill('+251911123456');
  await page.getByLabel('Country', { exact: true }).fill('Ethiopia');
  await page.getByLabel('City', { exact: true }).fill('Addis Ababa');
  await page.getByLabel('Street address').fill('Bole Road');
  await page.getByLabel('Restaurant slug').fill(`journey-${Date.now()}`);
  await page.getByRole('button', { name: 'Create restaurant' }).click();
  await expect(page).toHaveURL(/\/workspace\/.+\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Welcome to Journey Café.' })).toBeVisible();
  const dashboard = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to Journey Café.' })).toBeVisible();
  await page.getByRole('link', { name: 'Restaurant settings' }).click();
  await page.getByLabel('Restaurant name', { exact: true }).fill('Journey Café Updated');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('settings saved');
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'zayqora_csrf')!.value;
  const otherResponse = await page.request.post('/api/v1/restaurants', {
    headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': `second-${Date.now()}` },
    data: {
      name: 'Second Restaurant',
      slug: `second-${Date.now()}`,
      category: 'Bistro',
      phone: '+251911222222',
      email,
      country: 'Ethiopia',
      city: 'Hawassa',
      address: 'Lake Road',
      currency: 'ETB',
      timezone: 'Africa/Addis_Ababa',
    },
  });
  expect(otherResponse.status()).toBe(201);
  const other = (await otherResponse.json()).restaurant;
  await page.goto(dashboard);
  await expect(
    page.getByRole('heading', { name: 'Welcome to Journey Café Updated.' })
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.getByLabel('Switch restaurant').selectOption(other.id);
  await expect(page.getByRole('heading', { name: 'Welcome to Second Restaurant.' })).toBeVisible();
  await expect(page.getByText('Lake Road', { exact: true })).toBeVisible();
  await expect(page.getByText('Bole Road', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/login');
  await page.goto(dashboard);
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();
});
test('password reset through local email capture', async ({ page, request }) => {
  const email = `reset-${Date.now()}@example.com`;
  await request.post('/api/v1/auth/register', {
    data: { email, password: 'Password123!', full_name: 'Reset User' },
  });
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('reset link');
  const emails = (await (await request.get(`/api/v1/dev/emails?email=${email}`)).json()).emails;
  const token = emails.at(-1).text.match(/token=([a-f0-9]+)/)[1];
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel('Password', { exact: true }).fill('NewPassword123!');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('status')).toContainText('Password updated');
});
