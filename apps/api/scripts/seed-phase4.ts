import { randomUUID } from 'node:crypto';
import { env } from '../src/config/env.js';
import { pool } from '../src/database/pool.js';
import { withTransaction } from '../src/database/transaction.js';
import { access, args, enabled } from '../src/modules/operations/access.service.js';
import { q } from '../src/modules/operations/operations.repository.js';
import { adjustStock, saveRecipe } from '../src/modules/operations/inventory.service.js';
const url = new URL(env.DATABASE_URL);
if (env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Development localhost database only');
const id = process.env.SEED_RESTAURANT_ID,
  user = process.env.SEED_OWNER_ID;
if (!id || !user)
  throw new Error(
    'Set SEED_RESTAURANT_ID and SEED_OWNER_ID for an existing published pilot restaurant; no accounts or fixed passwords are created'
  );
try {
  const result = await withTransaction(async (c) => {
    const branch = (await q(c, 'defaultBranch', [id]))[0]?.id;
    const a = await access(c, id, branch, user, 'operations.configure');
    const { b } = await enabled(c, a);
    if ((await q(c, 'tables', args(a))).some((t) => t.name === 'Demo window table'))
      throw new Error('Operational demo is already seeded; refusing duplicate opening stock');
    const stations = [];
    for (const name of ['Demo grill', 'Demo finishing'])
      stations.push((await q(c, 'station', [...args(a), name]))[0]);
    const item = b.content.items[0];
    if (!item) throw new Error('Publish at least one menu item');
    for (const station of stations) await q(c, 'route', [...args(a), item.id, station.id]);
    const area = (await q(c, 'area', [...args(a), 'Demo dining room']))[0],
      table = (await q(c, 'table', [...args(a), area.id, 'Demo window table', 4]))[0],
      register = (await q(c, 'register', [...args(a), 'Demo counter']))[0],
      location = (await q(c, 'location', [...args(a), 'Demo pantry']))[0],
      ingredient = (await q(c, 'ingredient', [...args(a), 'Demo ingredient', 'g', 5000]))[0];
    await q(c, 'settingsSave', [
      id,
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
      'DEMO10',
      {
        code: 'DEMO10',
        kind: 'percent',
        value: 1000,
        minimum: 0,
        maximum: 0,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        limit: 100,
        perCustomer: 0,
        itemIds: [],
        categoryIds: [],
        modes: ['pickup', 'dine_in'],
        active: true,
      },
    ]);
    return {
      restaurantId: id,
      branchId: branch,
      table: table.name,
      register: register.name,
      recipeItem: item.name,
      coupon: 'DEMO10',
    };
  });
  console.log(result);
} finally {
  await pool.end();
}
