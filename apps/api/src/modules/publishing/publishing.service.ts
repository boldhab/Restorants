import {
  configurationPrice,
  isOpen,
  mediaIds,
  readiness,
  type Draft,
  type Availability,
} from '@zayqora/contracts';
import { withTransaction } from '../../database/transaction.js';
import { pool } from '../../database/pool.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import { publishingRepository as repo } from './publishing.repository.js';
import type { PoolClient } from 'pg';
async function checkAssets(client: PoolClient, restaurantId: string, draft: Draft) {
  const ids = mediaIds(draft);
  const rows = await repo.execute(client, 'selectMediaAssets', [restaurantId, ids]);
  if (rows.rowCount !== ids.length)
    throw new ValidationError('An image is missing or belongs to another restaurant');
}
export async function readDraft(restaurantId: string) {
  return withTransaction(async (client) => {
    const d = await repo.locked(client, restaurantId);
    const publication =
      (await repo.execute(client, 'selectWebsitePublications', [restaurantId])).rows[0] ?? null;
    const history = (await repo.execute(client, 'selectWebsiteRevisions', [restaurantId])).rows;
    return {
      draft: d.content,
      version: d.version,
      publication,
      history,
      assets: await repo.assets(client, restaurantId),
      issues: readiness(d.content),
    };
  });
}
export async function saveDraft(restaurantId: string, version: number, draft: Draft) {
  return withTransaction(async (client) => {
    const old = await repo.locked(client, restaurantId);
    if (old.version !== version)
      throw new ConflictError('Newer edits exist. Reload before saving.');
    const existing = await repo.execute(client, 'selectMenuItems', [restaurantId]);
    if (existing.rowCount && old.content.settings.currency !== draft.settings.currency)
      throw new ConflictError(
        'Currency cannot change after menu prices exist. Create a separate menu migration before converting amounts.'
      );
    // Identifiers remain stable after creation: archiving preserves operational/publication history.
    if (existing.rows.some((i) => !draft.items.some((n) => n.id === i.id)))
      throw new ValidationError('Archive existing items instead of deleting them');
    const oldCategories = await repo.execute(client, 'selectMenuCategories', [restaurantId]);
    if (oldCategories.rows.some((c) => !draft.categories.some((n) => n.id === c.id)))
      throw new ValidationError('Archive existing categories instead of deleting them');
    await checkAssets(client, restaurantId, draft);
    // Names can be swapped in one save without transient unique conflicts.
    await repo.execute(client, 'updateMenuCategories', [restaurantId]);
    for (const c of draft.categories)
      await repo.execute(client, 'insertMenuCategories', [restaurantId, c.id, c.name]);
    for (const item of draft.items) {
      await repo.execute(client, 'insertMenuItems', [
        restaurantId,
        item.id,
        item.categoryId,
        item.price,
        draft.settings.currency,
      ]);
      const previous = old.content.items.find((i) => i.id === item.id);
      const pricing = (i: typeof item) => JSON.stringify([i.price, i.variants, i.modifiers]);
      if (!previous || pricing(previous) !== pricing(item))
        await repo.execute(client, 'insertMenuPriceHistory', [
          restaurantId,
          item.id,
          item.price,
          draft.settings.currency,
          { variants: item.variants, modifiers: item.modifiers },
        ]);
    }
    const s = draft.settings;
    await repo.execute(client, 'updateRestaurants', [
      restaurantId,
      s.name,
      s.category,
      s.phone,
      s.email,
      s.address,
      s.timezone,
      s.currency,
    ]);
    await repo.execute(client, 'updateWebsiteDrafts', [restaurantId, draft]);
    return { version: version + 1, issues: readiness(draft) };
  });
}
export async function publish(restaurantId: string, version: number, actorId: string) {
  return withTransaction(async (client) => {
    const d = await repo.locked(client, restaurantId);
    if (d.version !== version) throw new ConflictError('Draft changed. Reload before publishing.');
    const issues = readiness(d.content);
    if (issues.length)
      throw new ValidationError(
        'Website is not ready',
        issues.map((message) => ({ field: 'readiness', message }))
      );
    await checkAssets(client, restaurantId, d.content);
    const snapshot: Draft = structuredClone(d.content);
    snapshot.categories = snapshot.categories
      .filter((c) => c.active)
      .sort((a, b) => a.order - b.order);
    snapshot.items = snapshot.items.filter(
      (i) => i.state === 'active' && snapshot.categories.some((c) => c.id === i.categoryId)
    );
    const revision =
      (await repo.execute(client, 'insertWebsiteRevisions', [restaurantId, version, snapshot]))
        .rows[0] ??
      (await repo.execute(client, 'selectWebsiteRevisions2', [restaurantId, version])).rows[0];
    for (const id of mediaIds(snapshot))
      await repo.execute(client, 'insertPublicationAssets', [restaurantId, revision.id, id]);
    await repo.execute(client, 'insertWebsitePublications', [restaurantId, revision.id]);
    await repo.execute(client, 'insertAuditLogs', [actorId, restaurantId, revision.id]);
    return { revision: revision.id };
  });
}
export async function unpublish(restaurantId: string, version: number, actorId: string) {
  return withTransaction(async (client) => {
    const d = await repo.locked(client, restaurantId);
    if (d.version !== version)
      throw new ConflictError('Draft changed. Reload before unpublishing.');
    await repo.execute(client, 'deleteWebsitePublications', [restaurantId]);
    await repo.execute(client, 'insertAuditLogs2', [actorId, restaurantId]);
    return { unpublished: true };
  });
}
export async function setAvailability(restaurantId: string, itemId: string, content: Availability) {
  return withTransaction(async (client) => {
    await repo.locked(client, restaurantId);
    if (!(await repo.execute(client, 'selectMenuItems2', [restaurantId, itemId])).rowCount)
      throw new NotFoundError('Item not found');
    await repo.execute(client, 'insertItemAvailability', [restaurantId, itemId, content]);
    return content;
  });
}
export async function publicWebsite(slug: string) {
  const r = await repo.current(slug);
  const availability = (await repo.execute(pool, 'selectItemAvailability', [r.restaurant_id])).rows;
  const now = new Date();
  return {
    revision: r.id,
    publishedAt: r.created_at,
    draft: r.content,
    open: isOpen(r.content.settings.hours, r.content.settings.timezone, now),
    availability: Object.fromEntries(
      r.content.items.map((i) => {
        const a = availability.find((a) => a.item_id === i.id)?.content as Availability | undefined;
        return [
          i.id,
          {
            soldOut: a?.soldOut ?? false,
            enabled: a?.enabled ?? true,
            scheduled: !a?.hours || isOpen(a.hours, r.content.settings.timezone, now),
            serviceModes: a?.serviceModes ?? r.content.settings.serviceModes,
          },
        ];
      })
    ),
    assets: (await repo.execute(pool, 'selectMediaAssets2', [r.restaurant_id, mediaIds(r.content)]))
      .rows,
  };
}
export async function validateConfiguration(
  slug: string,
  input: { revision: string; itemId: string; variantId?: string; options: string[] },
  mode?: string
) {
  const site = await publicWebsite(slug);
  if (site.revision !== input.revision)
    throw new ConflictError('The published menu changed. Refresh this item configuration.');
  const item = site.draft.items.find((i) => i.id === input.itemId);
  if (!item) throw new NotFoundError('Published item not found');
  const availability = site.availability[item.id];
  if (
    !availability.enabled ||
    availability.soldOut ||
    !availability.scheduled ||
    (mode && !availability.serviceModes.some((m) => m === mode))
  )
    throw new ValidationError('Item is currently unavailable');
  try {
    return {
      price: configurationPrice(item, input.variantId, input.options),
      currency: site.draft.settings.currency,
      restaurantOpen: site.open,
      label: 'Menu pricing only; checkout taxes and fulfillment fees are not included.',
    };
  } catch (e) {
    throw new ValidationError((e as Error).message);
  }
}

export async function readAvailability(restaurantId: string, itemId: string) {
  return repo.availability(restaurantId, itemId);
}
export async function websiteIndex() {
  return (await repo.websiteIndex()).map((r) => ({
    slug: r.slug,
    pages: [
      '',
      'menu',
      ...['about', 'gallery', 'contact'].filter(
        (page) =>
          r.content.theme.sections.some(
            (s: { name: string; visible: boolean }) => s.name === page && s.visible
          ) &&
          (page !== 'about' || r.content.theme.story) &&
          (page !== 'gallery' || r.content.theme.gallery.length)
      ),
    ],
  }));
}
