import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { pool } from '../src/database/pool.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { withTransaction } from '../src/database/transaction.js';
import { defaultCommerceSettings } from '@zayqora/contracts';
import { seedPermissions } from '../database/seeds/permissions.seed.js';
import { seedRoles } from '../database/seeds/roles.seed.js';
import { seedDemoRestaurants } from '../database/seeds/demo-restaurants.seed.js';
import { readDraft, saveDraft, publish } from '../src/modules/publishing/publishing.service.js';
import { uploadImage } from '../src/modules/publishing/media.service.js';
import { platformChange, saveSettings, readSettings } from '../src/modules/commerce/management.service.js';
import { access, args, enabled } from '../src/modules/operations/access.service.js';
import { q } from '../src/modules/operations/operations.repository.js';
import { adjustStock, saveRecipe } from '../src/modules/operations/inventory.service.js';

if (!['development', 'test'].includes(env.NODE_ENV)) {
  logger.error('Refusing to run demo seed outside development/test!');
  process.exit(1);
}

const RESTAURANT_CONFIGS = [
  {
    slug: 'bella-italia',
    category: 'Pasta',
    item: 'Demo · Garden pasta',
    color: '#6b7c42',
    price: 1400,
    themeColor: 'forest' as const,
    stations: ['Demo grill', 'Demo finishing'],
    area: 'Demo dining room',
    table: 'Demo window table',
    register: 'Demo counter',
    location: 'Demo pantry',
    ingredient: 'Demo ingredient',
    coupon: 'DEMO10',
    couponValue: 1000,
  },
  {
    slug: 'tokyo-ramen',
    category: 'Ramen',
    item: 'Demo · Miso ramen',
    color: '#983e29',
    price: 1600,
    themeColor: 'terracotta' as const,
    stations: ['Noodle Boiler', 'Broth & Topping Station'],
    area: 'Ramen Bar',
    table: 'Bar Booth 1',
    register: 'Counter Register',
    location: 'Dry Storage',
    ingredient: 'Ramen Noodles',
    coupon: 'RAMEN10',
    couponValue: 1000,
  },
  {
    slug: 'le-petit-bistro',
    category: 'French Specialties',
    item: 'Demo · Steak frites',
    color: '#2b4c7e',
    price: 2400,
    themeColor: 'navy' as const,
    stations: ['Sauté Station', 'Pastry & Finishing'],
    area: 'Bistro Dining Room',
    table: 'Bistro Table 1',
    register: 'Front Register',
    location: 'Pantry & Cellar',
    ingredient: 'French Butter',
    coupon: 'BISTRO15',
    couponValue: 1500,
  },
  {
    slug: 'taco-fiesta',
    category: 'Tacos & Antojitos',
    item: 'Demo · Birria tacos',
    color: '#d97706',
    price: 1500,
    themeColor: 'terracotta' as const,
    stations: ['Taco Line', 'Plating & Salsa Bar'],
    area: 'Cantina Hall',
    table: 'Fiesta Booth 1',
    register: 'Taqueria POS',
    location: 'Spice Storage',
    ingredient: 'Corn Tortillas',
    coupon: 'FIESTA20',
    couponValue: 2000,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== Step 1: Seeding RBAC & Demonstration Restaurants ===');
    await client.query('BEGIN');
    await seedPermissions(client);
    await seedRoles(client);
    await seedDemoRestaurants(client);
    await client.query('COMMIT');
    console.log('Step 1 complete: Users, roles, permissions and 4 restaurants seeded.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const admin = (await pool.query('SELECT id FROM users WHERE is_platform_admin = true')).rows[0];

  for (const cfg of RESTAURANT_CONFIGS) {
    console.log(`\n=== Processing Restaurant: ${cfg.slug} ===`);
    const restRow = (
      await pool.query(
        `SELECT r.id, r.slug, r.name, u.id as owner_id
         FROM restaurants r
         JOIN restaurant_memberships rm ON rm.restaurant_id = r.id
         JOIN users u ON u.id = rm.user_id
         JOIN membership_roles mr ON mr.membership_id = rm.id
         JOIN roles ro ON ro.id = mr.role_id AND ro.name = 'owner'
         WHERE r.slug = $1`,
        [cfg.slug]
      )
    ).rows[0];

    if (!restRow) {
      throw new Error(`Could not find owner for restaurant ${cfg.slug}`);
    }

    const restaurantId = restRow.id;
    const ownerId = restRow.owner_id;

    // 2. Draft & Menu setup
    console.log(`[Phase 2] Ensuring draft and swatch image for ${cfg.slug}...`);
    const saved = await readDraft(restaurantId);
    let draftVersion = saved.version;

    if (!saved.draft.items.length) {
      const bytes = await sharp({
        create: { width: 1200, height: 800, channels: 3, background: cfg.color },
      })
        .png()
        .toBuffer();
      const asset = await uploadImage(restaurantId, bytes, `Color swatch for ${cfg.slug}`);

      const d = saved.draft;
      d.settings.description = `DEVELOPMENT FIXTURE · ${restRow.name} demonstration content.`;
      d.settings.cover = asset.id;
      d.settings.serviceModes = ['dine_in', 'takeaway'];
      d.settings.hours.week = Array.from({ length: 7 }, () => [{ start: 660, end: 1380 }]);

      const categoryId = randomUUID();
      d.categories = [
        {
          id: categoryId,
          name: cfg.category,
          description: `${restRow.name} specialties category`,
          image: null,
          order: 0,
          active: true,
        },
      ];
      d.items = [
        {
          id: randomUUID(),
          categoryId,
          name: cfg.item,
          description: `${restRow.name} signature dish, freshly prepared.`,
          image: asset.id,
          price: cfg.price,
          preparationMinutes: 15,
          featured: true,
          dietary: 'Demo information',
          allergens: 'Contact the restaurant',
          state: 'active',
          variants: [{ id: randomUUID(), name: 'Large', price: cfg.price + 300 }],
          modifiers: [
            {
              id: randomUUID(),
              name: 'Options',
              min: 0,
              max: 1,
              options: [{ id: randomUUID(), name: 'Extra portion', price: 200, available: true }],
            },
          ],
        },
      ];
      d.theme.title = restRow.name;
      d.theme.story = `Welcome to ${restRow.name}. Authentic recipes crafted with care.`;
      d.theme.color = cfg.themeColor;

      const saveRes = await saveDraft(restaurantId, saved.version, d);
      draftVersion = saveRes.version;
      console.log(`[Phase 2] Draft saved (v${draftVersion}) for ${cfg.slug}`);
    }

    // 3. Publish website
    const pubCheck = await pool.query(
      'SELECT revision_id FROM website_publications WHERE restaurant_id = $1',
      [restaurantId]
    );
    if (!pubCheck.rows.length) {
      console.log(`[Phase 2] Publishing website for ${cfg.slug}...`);
      const pubRes = await publish(restaurantId, draftVersion, ownerId);
      console.log(`[Phase 2] Published ${cfg.slug} (revision: ${pubRes.revision})`);
    } else {
      console.log(`[Phase 2] Website for ${cfg.slug} is already published.`);
    }

    // 4. Pilot subscription & commerce settings
    console.log(`[Phase 3] Configuring pilot plan & commerce for ${cfg.slug}...`);
    await platformChange(
      restaurantId,
      { plan: 'pilot', subscriptionStatus: 'manual', reason: 'Development seed' },
      admin.id
    );
    const curSettings = await readSettings(restaurantId);
    await saveSettings(
      restaurantId,
      curSettings.version,
      {
        ...defaultCommerceSettings,
        enabled: true,
        reservations: true,
      },
      ownerId
    );
    console.log(`[Phase 3] Pilot plan & commerce enabled for ${cfg.slug}`);

    // 5. Phase 4 Operations
    console.log(`[Phase 4] Checking operational setup for ${cfg.slug}...`);
    await withTransaction(async (c) => {
      const branch = (await q(c, 'defaultBranch', [restaurantId]))[0]?.id;
      const a = await access(c, restaurantId, branch, ownerId, 'operations.configure');
      const { b } = await enabled(c, a);

      const existingTables = await q(c, 'tables', args(a));
      if (existingTables.length > 0) {
        console.log(`[Phase 4] Operations already seeded for ${cfg.slug}; skipping.`);
        return;
      }

      const stations = [];
      for (const name of cfg.stations) {
        stations.push((await q(c, 'station', [...args(a), name]))[0]);
      }

      const item = b.content.items[0];
      if (!item) throw new Error(`Publish at least one menu item for ${cfg.slug}`);
      for (const station of stations) {
        await q(c, 'route', [...args(a), item.id, station.id]);
      }

      const area = (await q(c, 'area', [...args(a), cfg.area]))[0];
      const table = (await q(c, 'table', [...args(a), area.id, cfg.table, 4]))[0];
      const register = (await q(c, 'register', [...args(a), cfg.register]))[0];
      const location = (await q(c, 'location', [...args(a), cfg.location]))[0];
      const ingredient = (await q(c, 'ingredient', [...args(a), cfg.ingredient, 'g', 5000]))[0];

      await q(c, 'settingsSave', [
        restaurantId,
        {
          kitchen: true,
          tables: true,
          pos: true,
          cash: true,
          delivery: false,
          inventory: true,
          coupons: true,
        },
      ]);

      await adjustStock(c, a, {
        ingredientId: ingredient.id,
        locationId: location.id,
        quantity: 100000,
        unit: 'g',
        kind: 'OPENING',
        key: 'demo-opening-' + randomUUID(),
        reason: 'Development demo opening stock',
      });

      await saveRecipe(c, a, {
        itemId: item.id,
        variantId: null,
        optionId: null,
        locationId: location.id,
        components: [{ ingredientId: ingredient.id, quantity: 1000 }],
      });

      await q(c, 'coupon', [
        ...args(a),
        cfg.coupon,
        {
          code: cfg.coupon,
          kind: 'percent',
          value: cfg.couponValue,
          minimum: 0,
          maximum: 0,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
          limit: 100,
          perCustomer: 0,
          itemIds: [],
          categoryIds: [],
          modes: ['pickup', 'dine_in'],
          active: true,
        },
      ]);

      console.log(
        `[Phase 4] Seeded operations: station=${stations.map((s) => s.name).join(', ')}, table=${table.name}, register=${register.name}, coupon=${cfg.coupon}`
      );
    });
  }

  console.log('\n=== All 4 restaurants and data seeded successfully! ===');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(() => pool.end());
