import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { pool } from '../src/database/pool.js';
import { env } from '../src/config/env.js';
import { readDraft, saveDraft } from '../src/modules/publishing/publishing.service.js';
import { uploadImage } from '../src/modules/publishing/media.service.js';
if (!['development', 'test'].includes(env.NODE_ENV))
  throw new Error('Phase 2 fixtures are development/test only');
try {
  for (const [slug, category, item, color, price] of [
    ['bella-italia', 'Pasta', 'Demo · Garden pasta', '#6b7c42', 1400],
    ['tokyo-ramen', 'Ramen', 'Demo · Miso ramen', '#983e29', 1600],
  ] as const) {
    const r = (await pool.query('SELECT id FROM restaurants WHERE slug=$1', [slug])).rows[0];
    if (!r) throw new Error('Run the development Phase 1 seed first');
    const saved = await readDraft(r.id);
    if (saved.draft.items.length) continue; // Never overwrite user menu edits.
    const d = saved.draft;
    // Clearly marked synthetic swatch, not a claimed restaurant photograph.
    const bytes = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: color },
    })
      .png()
      .toBuffer();
    const asset = await uploadImage(r.id, bytes, `Development fixture color swatch for ${slug}`);
    d.settings.description = 'DEVELOPMENT FIXTURE · Demonstration restaurant content only.';
    d.settings.cover = asset.id;
    d.settings.hours.week = Array.from({ length: 7 }, () => [{ start: 660, end: 1380 }]);
    const categoryId = randomUUID();
    d.categories = [
      {
        id: categoryId,
        name: category,
        description: 'Development fixture category',
        image: null,
        order: 0,
        active: true,
      },
    ];
    d.items = [
      {
        id: randomUUID(),
        categoryId,
        name: item,
        description: 'Development fixture dish, not a real restaurant offering.',
        image: asset.id,
        price,
        preparationMinutes: 15,
        featured: true,
        dietary: 'Restaurant supplied demo information',
        allergens: 'Contact the restaurant',
        state: 'active',
        variants: [{ id: randomUUID(), name: 'Large', price: price + 300 }],
        modifiers: [
          {
            id: randomUUID(),
            name: 'Extras',
            min: 0,
            max: 1,
            options: [{ id: randomUUID(), name: 'Extra vegetables', price: 200, available: true }],
          },
        ],
      },
    ];
    d.theme.story = `DEVELOPMENT FIXTURE · ${slug} demonstration story.`;
    d.theme.color = slug === 'bella-italia' ? 'forest' : 'terracotta';
    await saveDraft(r.id, saved.version, d);
  }
  console.log('Phase 2 development drafts saved; no websites were published.');
} finally {
  await pool.end();
}
