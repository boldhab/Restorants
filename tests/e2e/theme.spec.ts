import { test, expect, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { defaultCommerceSettings } from '@zayqora/contracts';
const baseline = process.env.THEME_BASELINE === 'true';
const target =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:1234@127.0.0.1:5432/zayqora_test';
if (!new URL(target).pathname.endsWith('_test'))
  throw new Error('Dedicated test database required');
function luminance(rgb: number[]) {
  return rgb
    .map((n) => {
      const c = n / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function ratio(a: string, b: string) {
  const parse = (c: string) =>
    c
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
  const x = luminance(parse(a)),
    y = luminance(parse(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
async function textContrast(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const parse = (value: string) => {
      const v = value.match(/[\d.]+/g)?.map(Number);
      return v && v.length >= 3 ? [v[0], v[1], v[2], v[3] ?? 1] : null;
    };
    const luminance = (v: number[]) =>
      v
        .slice(0, 3)
        .map((c) => {
          c /= 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const failures: any[] = [];
    let checked = 0,
      node: Node | null;
    while ((node = walker.nextNode())) {
      const e = node.parentElement;
      if (
        !e ||
        !node.textContent?.trim() ||
        e.closest(
          'script,style,noscript,[aria-hidden="true"],.wordmark,.restaurant-brand,.restaurant-hero,button:disabled'
        )
      )
        continue;
      const style = getComputedStyle(e);
      if (!e.getClientRects().length || style.visibility !== 'visible') continue;
      const fg = parse(style.color);
      if (!fg || fg[3] === 0) continue;
      let bg = [255, 255, 255, 1];
      const layers: number[][] = [];
      let parent: Element | null = e;
      while (parent) {
        const c = parse(getComputedStyle(parent).backgroundColor);
        if (c) {
          layers.push(c);
          if (c[3] >= 1) break;
        }
        parent = parent.parentElement;
      }
      for (const c of layers.reverse())
        bg = [...c.slice(0, 3).map((v, i) => v * c[3] + bg[i] * (1 - c[3])), 1];
      const color = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
      const x = luminance(color),
        y = luminance(bg);
      const contrast = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      const large =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      const minimum = large ? 3 : 4.5;
      checked++;
      if (contrast < minimum)
        failures.push({
          text: node.textContent.trim().slice(0, 70),
          color: style.color,
          background: bg,
          contrast,
          minimum,
        });
    }
    return { checked, failures };
  });
}
test('Ember theme: screens, storefront isolation, contrast, keyboard and four viewport widths', async ({
  page,
  browser,
}) => {
  test.setTimeout(360000);
  const folder =
    process.env.THEME_ARTIFACT_DIR || `artifacts/ember-theme/${baseline ? 'before' : 'after'}`;
  await mkdir(folder, { recursive: true });
  const stamp = Date.now(),
    email = `theme-${stamp}@example.com`;
  const password = 'Theme-Test-Only-123!';
  const db = new Client({ connectionString: target });
  await db.connect();
  const guest = await browser.newContext();
  const anonymous = await browser.newContext();
  try {
    const registration = await page.request.post('/api/v1/auth/register', {
      data: { email, password, full_name: 'Theme Verification' },
    });
    expect(registration.status()).toBe(201);
    const mail = (
      await (await page.request.get('/api/v1/dev/emails?email=' + email)).json()
    ).emails.at(-1);
    const token = mail.text.match(/token=([a-f0-9]+)/)[1];
    expect(
      (await page.request.post('/api/v1/auth/verify-email', { data: { token } })).ok()
    ).toBeTruthy();
    await page.request.post('/api/v1/auth/login', { data: { email, password } });
    async function mutate(context: BrowserContext, path: string, data: any, method = 'POST') {
      const csrf = decodeURIComponent(
        (await context.cookies()).find((c) => c.name === 'zayqora_csrf')!.value
      );
      const r = await context.request.fetch('/api/v1' + path, {
        method,
        headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': randomUUID() },
        data,
      });
      expect(r.ok(), await r.text()).toBeTruthy();
      return r.json();
    }
    async function restaurant(name: string, slug: string) {
      return (
        await mutate(page.context(), '/restaurants', {
          name,
          slug,
          category: 'Restaurant',
          phone: '+251911234567',
          email,
          country: 'Ethiopia',
          city: 'Addis Ababa',
          address: 'Bole Road',
          currency: 'USD',
          timezone: 'UTC',
        })
      ).restaurant;
    }
    const restaurantA = await restaurant('The Gathering Table', `theme-${stamp}`),
      other = await restaurant('City Kitchen', `theme-second-${stamp}`),
      id = restaurantA.id,
      base = `/ops/${id}`;
    const draft = (await (await page.request.get(`/api/v1/restaurants/${id}/website/draft`)).json())
      .draft;
    const csrf = decodeURIComponent(
      (await page.context().cookies()).find((c) => c.name === 'zayqora_csrf')!.value
    );
    const image = await page.request.post(`/api/v1/restaurants/${id}/media`, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-CSRF-Token': csrf,
        'X-Image-Alt': 'Development fixture image',
      },
      data: await readFile('apps/web/public/images/restaurant-atmosphere.webp'),
    });
    expect(image.status()).toBe(201);
    const asset = (await image.json()).id,
      categoryId = randomUUID(),
      itemId = randomUUID();
    draft.settings.description = 'Seasonal food, thoughtful service, a place to gather.';
    draft.theme.story =
      'A neighborhood table for seasonal food and unhurried conversation. This is an illustrative restaurant story for browser verification.';
    draft.settings.cover = asset;
    draft.settings.serviceModes = ['takeaway', 'dine_in'];
    draft.settings.hours.week = Array.from({ length: 7 }, () => [
      { start: 0, end: 720 },
      { start: 720, end: 0 },
    ]);
    draft.categories = [
      {
        id: categoryId,
        name: 'Seasonal plates',
        description: 'Prepared fresh',
        image: null,
        order: 0,
        active: true,
      },
    ];
    draft.items = [
      {
        id: itemId,
        categoryId,
        name: 'Garden bowl',
        description: 'A seasonal bowl, prepared to order.',
        image: asset,
        price: 1400,
        preparationMinutes: 15,
        featured: true,
        dietary: 'Vegetarian',
        allergens: 'Sesame',
        state: 'active',
        variants: [],
        modifiers: [],
      },
    ];
    await mutate(
      page.context(),
      `/restaurants/${id}/website/draft`,
      { version: 0, draft },
      'PATCH'
    );
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
        taxBps: 1000,
        serviceCharge: 50,
        capacity: 20,
        maxParty: 8,
      },
    ]);
    const station = await mutate(page.context(), base + '/kitchen/stations', {
      name: 'Main kitchen',
    });
    await mutate(page.context(), base + '/kitchen/routing', { itemId, stationIds: [station.id] });
    const area = await mutate(page.context(), base + '/areas', { name: 'Dining room' }),
      table = await mutate(page.context(), base + '/tables', {
        areaId: area.id,
        name: 'Window table',
        seats: 4,
      }),
      location = await mutate(page.context(), base + '/inventory/locations', { name: 'Pantry' }),
      ingredient = await mutate(page.context(), base + '/inventory/ingredients', {
        name: 'Seasonal vegetables',
        unit: 'g',
        threshold: 10000,
      }),
      register = await mutate(page.context(), base + '/cash/registers', { name: 'Counter' });
    await mutate(
      page.context(),
      base + '/settings',
      {
        kitchen: true,
        tables: true,
        pos: true,
        cash: true,
        delivery: false,
        inventory: true,
        coupons: false,
      },
      'PATCH'
    );
    await mutate(page.context(), base + '/inventory/movements', {
      ingredientId: ingredient.id,
      locationId: location.id,
      quantity: 5000,
      unit: 'g',
      kind: 'OPENING',
      reason: 'Visual verification fixture',
      key: randomUUID(),
    });
    await mutate(page.context(), base + '/visits', {
      tableId: table.id,
      party: 2,
      expectedEnd: new Date(Date.now() + 3600000).toISOString(),
    });
    await mutate(page.context(), base + '/cash/sessions', {
      registerId: register.id,
      opening: 1000,
    });
    async function commerce(path: string, data?: any, method = 'POST') {
      const session = await (await guest.request.get(`/api/v1/commerce/${id}/session`)).json();
      const r = await guest.request.fetch(`/api/v1/commerce/${id}${path}`, {
        method: data ? method : 'GET',
        headers: { 'X-Guest-CSRF': session.csrf, 'Idempotency-Key': randomUUID() },
        data,
      });
      expect(r.ok(), await r.text()).toBeTruthy();
      return r.json();
    }
    const contact = {
      name: 'Guest Diner',
      email: 'theme-diner@example.com',
      phone: '+251911111111',
    };
    for (let i = 0; i < 3; i++) {
      const cart = await commerce('/cart');
      await commerce(
        '/cart',
        { version: cart.version, line: { itemId, quantity: 1, options: [] } },
        'PATCH'
      );
      const quote = await commerce('/quotes', {});
      const order = await commerce('/orders', {
        quoteId: quote.id,
        contact,
        method: 'pay_at_pickup',
      });
      await mutate(
        page.context(),
        `/operations/${id}/orders/${order.id}`,
        { version: 0, status: 'CONFIRMED', reason: 'Accepted for visual verification' },
        'PATCH'
      );
      if (i === 1) {
        const work = (
          await (await page.request.get('/api/v1' + base + '/kitchen')).json()
        ).work.find((w: any) => w.order_id === order.id);
        await mutate(page.context(), base + '/kitchen/work/' + work.id, {
          version: 0,
          action: 'start',
          reason: 'Preparing guest order',
        });
      }
      if (i === 2)
        await mutate(
          page.context(),
          `/operations/${id}/orders/${order.id}`,
          { version: 1, status: 'CANCELLED', reason: 'Guest cancelled before preparation' },
          'PATCH'
        );
    }
    const cart = await commerce('/cart');
    await commerce(
      '/cart',
      { version: cart.version, line: { itemId, quantity: 2, options: [] } },
      'PATCH'
    );
    const visitor = await guest.newPage(),
      auth = await anonymous.newPage();
    const screens = [
      { name: 'platform-home', p: auth, path: '/', ready: 'Good food brings' },
      { name: 'platform-about', p: auth, path: '/about', ready: 'Hospitality at heart.' },
      { name: 'login', p: auth, path: '/login', ready: 'Welcome back.' },
      { name: 'onboarding', p: page, path: '/onboarding', ready: 'Let’s make it' },
      { name: 'dashboard', p: page, path: `/workspace/${id}/dashboard`, ready: 'Welcome to' },
      {
        name: 'editor',
        p: page,
        path: `/workspace/${id}/website`,
        ready: 'Your table. Your story.',
      },
      { name: 'home', p: visitor, path: `/r/${restaurantA.slug}`, ready: 'The Gathering Table' },
      {
        name: 'about',
        p: visitor,
        path: `/r/${restaurantA.slug}/about`,
        ready: 'A place at our table.',
      },
      { name: 'menu', p: visitor, path: `/r/${restaurantA.slug}/menu`, ready: 'Garden bowl' },
      {
        name: 'checkout',
        p: visitor,
        path: `/shop/${id}/checkout`,
        ready: 'Review your pickup order',
      },
      { name: 'kitchen', p: page, path: `/operations/${id}/kitchen`, ready: 'Kitchen' },
      { name: 'pos', p: page, path: `/operations/${id}/pos`, ready: 'POS' },
      { name: 'tables', p: page, path: `/operations/${id}/tables`, ready: 'Tables' },
      { name: 'inventory', p: page, path: `/operations/${id}/inventory`, ready: 'Inventory' },
      { name: 'reports', p: page, path: `/operations/${id}/reports`, ready: 'Reports & exports' },
      {
        name: 'settings',
        p: page,
        path: `/workspace/${id}/settings`,
        ready: 'The details matter.',
      },
    ];
    const measurements: any[] = [];
    for (const screen of screens) {
      await screen.p.goto(screen.path);
      await expect(
        screen.p.getByRole('heading', { name: new RegExp(screen.ready) }).first()
      ).toBeVisible();
      if (['kitchen', 'pos', 'tables', 'inventory', 'reports'].includes(screen.name))
        await expect(screen.p.getByRole('status').first()).toContainText('Connected');
      if (screen.name === 'pos') {
        await expect(
          screen.p.getByRole('button', { name: 'Add Garden bowl', exact: true })
        ).toBeVisible();
        await screen.p.getByRole('button', { name: 'Add Garden bowl', exact: true }).click();
        await expect(screen.p.locator('.pos-cart')).toContainText('1 × Garden bowl');
      }
      for (const width of [390, 768, 1280, 1440]) {
        await screen.p.setViewportSize({ width, height: 900 });
        await expect
          .poll(() => screen.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
        if (screen.name.startsWith('platform-')) {
          const columns = await screen.p.locator('.marketing-footer-main').boundingBox();
          const bottom = await screen.p.locator('.marketing-footer-bottom').boundingBox();
          expect(bottom!.y).toBeGreaterThanOrEqual(columns!.y + columns!.height - 1);
        }
        if (!baseline && width === 390) {
          const bar = screen.p.locator('.navigation-bar:visible').first();
          if (await bar.count()) {
            const toggle = bar.locator('.navigation-toggle');
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            await expect(bar.locator('nav')).toBeVisible();
            const expandedContrast = await textContrast(screen.p);
            expect(expandedContrast.failures).toEqual([]);
            await screen.p.screenshot({
              path: `${folder}/navigation-${screen.name}-390.png`,
              fullPage: true,
            });
            await bar.locator('nav').getByRole('link').first().focus();
            await screen.p.keyboard.press('Escape');
            await expect(toggle).toBeFocused();
            await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          }
          const workspaceToggle = screen.p.getByRole('button', {
            name: 'Workspace menu',
            exact: true,
          });
          if (await workspaceToggle.count()) {
            await workspaceToggle.click();
            const navigation = screen.p.getByRole('navigation', {
              name: 'Workspace navigation',
              exact: true,
            });
            await expect(navigation).toBeVisible();
            await screen.p.screenshot({
              path: `${folder}/navigation-${screen.name}-390.png`,
              fullPage: true,
            });
            await navigation.getByRole('link').first().focus();
            await screen.p.keyboard.press('Escape');
            await expect(workspaceToggle).toBeFocused();
            await expect(workspaceToggle).toHaveAttribute('aria-expanded', 'false');
          }
          const operationsToggle = screen.p.getByRole('button', {
            name: 'Operations menu',
            exact: true,
          });
          if (await operationsToggle.count()) {
            await operationsToggle.click();
            const navigation = screen.p.getByRole('navigation', {
              name: 'Daily operations navigation',
              exact: true,
            });
            await expect(navigation).toBeVisible();
            await expect
              .poll(() =>
                screen.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
              )
              .toBe(true);
            await screen.p.screenshot({
              path: `${folder}/operations-menu-${screen.name}-390.png`,
              fullPage: true,
            });
            await navigation.getByRole('link').first().focus();
            await screen.p.keyboard.press('Escape');
            await expect(operationsToggle).toBeFocused();
            await expect(operationsToggle).toHaveAttribute('aria-expanded', 'false');
          }
        }
        if (!baseline && width === 1280) {
          const collapse = screen.p.getByRole('button', { name: 'Collapse sidebar', exact: true });
          if (await collapse.count()) {
            await collapse.click();
            const sidebar = screen.p.getByRole('complementary', {
              name: 'Operations sidebar',
              exact: true,
            });
            await expect
              .poll(() => sidebar.evaluate((e) => Math.round(e.getBoundingClientRect().width)))
              .toBe(68);
            await expect
              .poll(() => sidebar.evaluate((e) => e.scrollWidth <= e.clientWidth))
              .toBe(true);
            await expect(sidebar.getByRole('link', { name: 'Kitchen', exact: true })).toBeVisible();
            await screen.p.screenshot({
              animations: 'disabled',
              path: `${folder}/operations-rail-${screen.name}-1280.png`,
              fullPage: true,
            });
            await screen.p.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
            await expect
              .poll(() =>
                sidebar.evaluate((e) => !e.getAnimations().some((a) => a.playState === 'running'))
              )
              .toBe(true);
          }
        }
        if (!baseline) {
          const contrast = await textContrast(screen.p);
          expect(contrast.failures, JSON.stringify(contrast.failures)).toEqual([]);
          measurements.push({ screen: screen.name, width, textContrast: contrast });
          expect(
            await screen.p.locator('body').evaluate((e) => getComputedStyle(e).backgroundColor)
          ).toBe('rgb(255, 255, 255)');
          const button = screen.p.locator(':is(.primary, .button-primary):visible').first();
          if (await button.count()) {
            const styles = await button.evaluate((e) => ({
              color: getComputedStyle(e).color,
              background: getComputedStyle(e).backgroundColor,
              height: e.getBoundingClientRect().height,
            }));
            expect(ratio(styles.color, styles.background)).toBeGreaterThanOrEqual(4.5);
            expect(styles.height).toBeGreaterThanOrEqual(44);
            measurements.push({ screen: screen.name, width, ...styles });
          }
        }
        await screen.p.screenshot({
          path: `${folder}/${screen.name}-${width}.png`,
          fullPage: true,
        });
      }
    }
    for (const theme of ['forest', 'navy', 'terracotta']) {
      const current = await (
        await page.request.get(`/api/v1/restaurants/${id}/website/draft`)
      ).json();
      current.draft.theme.color = theme;
      await mutate(
        page.context(),
        `/restaurants/${id}/website/draft`,
        { version: current.version, draft: current.draft },
        'PATCH'
      );
      await mutate(page.context(), `/restaurants/${id}/website/publish`, {
        version: current.version + 1,
      });
      await visitor.goto(`/r/${restaurantA.slug}/menu`);
      await expect(visitor.locator('.restaurant-site:visible')).toHaveClass(
        new RegExp('theme-' + theme)
      );
      if (!baseline) {
        const style = await visitor.locator('.restaurant-site:visible').evaluate((e) => ({
          background: getComputedStyle(e).backgroundColor,
          brand: getComputedStyle(e).getPropertyValue('--brand').trim(),
        }));
        expect(style.background).toBe('rgb(255, 255, 255)');
        measurements.push({ theme, ...style });
      }
    }
    await visitor.setViewportSize({ width: 390, height: 900 });
    await visitor.goto(`/r/${restaurantA.slug}`);
    const publicSite = visitor.locator('.restaurant-site:visible');
    const toggle = publicSite.getByRole('button', { name: 'Open menu', exact: true });
    await toggle.click();
    const navigation = publicSite.getByRole('navigation', {
      name: 'Restaurant navigation',
      exact: true,
    });
    await expect(navigation).toBeVisible();
    await navigation.getByRole('link', { name: 'Menu', exact: true }).focus();
    await visitor.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await navigation.getByRole('link', { name: 'Our story', exact: true }).click();
    await expect(visitor).toHaveURL(`/r/${restaurantA.slug}/about`);
    await expect(
      visitor.getByRole('heading', { name: 'A place at our table.', exact: true })
    ).toBeVisible();
    await visitor.route('**/api/v1/public/restaurants/*/media/*', (route) => route.abort());
    for (let attempt = 0; attempt < 3; attempt++) {
      await visitor.goto(`/r/${restaurantA.slug}`);
      const heroImage = visitor.locator('.restaurant-site:visible .hero-photo');
      await expect(heroImage).toHaveAttribute('src', '/images/restaurant-atmosphere.webp');
      await expect
        .poll(() => heroImage.evaluate((e: HTMLImageElement) => e.naturalWidth))
        .toBeGreaterThan(0);
    }
    await visitor.screenshot({ path: `${folder}/home-fallback-390.png`, fullPage: true });
    await visitor.unroute('**/api/v1/public/restaurants/*/media/*');
    await page.goto(`/workspace/${id}/dashboard`);
    await page.getByLabel('Switch restaurant').selectOption(other.id);
    await expect(page).toHaveURL(`/workspace/${other.id}/dashboard`);
    await expect(page.getByRole('heading', { name: /Welcome to/ })).toContainText('City Kitchen');
    await auth.goto('/login');
    await auth.getByLabel('Email address').focus();
    await auth.keyboard.press('Tab');
    await expect(auth.getByLabel('Password', { exact: true })).toBeFocused();
    if (!baseline) {
      const focus = await auth.getByLabel('Password', { exact: true }).evaluate((e) => ({
        outline: getComputedStyle(e).outlineStyle,
        width: getComputedStyle(e).outlineWidth,
      }));
      expect(focus.outline).toBe('solid');
      expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
    }
    await visitor.goto(`/r/${restaurantA.slug}/menu`);
    await visitor.getByRole('button', { name: 'View dish', exact: true }).click();
    await expect(visitor.getByRole('dialog')).toBeVisible();
    await visitor.keyboard.press('Escape');
    await expect(visitor.getByRole('dialog')).not.toBeVisible();
    await expect(visitor.getByRole('button', { name: 'View dish', exact: true })).toBeFocused();
    await auth.emulateMedia({ reducedMotion: 'reduce' });
    expect(await auth.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true
    );
    await writeFile(`${folder}/measurements.json`, JSON.stringify(measurements, null, 2));
  } finally {
    await anonymous.close();
    await guest.close();
    await db.end();
  }
});
