import { publishingQueries } from './publishing.queries.js';
import type { PoolClient } from 'pg';
import { pool } from '../../database/pool.js';
import { initialDraft, type Draft } from '@zayqora/contracts';
import { NotFoundError } from '../../shared/errors/app-error.js';
export const publishingRepository = {
  execute(
    client: Pick<PoolClient, 'query'>,
    operation: keyof typeof publishingQueries,
    values: unknown[] = []
  ) {
    return client.query(publishingQueries[operation], values);
  },
  async locked(client: PoolClient, restaurantId: string) {
    const r = (
      await client.query(
        'SELECT name,category,phone,email,address,timezone,currency,status FROM restaurants WHERE id=$1 FOR UPDATE',
        [restaurantId]
      )
    ).rows[0];
    if (!r || !['active', 'onboarding'].includes(r.status))
      throw new NotFoundError('Restaurant unavailable');
    const { status: _status, ...profile } = r;
    await client.query(
      'INSERT INTO website_drafts(restaurant_id,content) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [restaurantId, initialDraft(profile)]
    );
    return (
      await client.query('SELECT * FROM website_drafts WHERE restaurant_id=$1', [restaurantId])
    ).rows[0] as { version: number; content: Draft };
  },
  async assets(client: Pick<PoolClient, 'query'>, restaurantId: string) {
    return (
      await client.query(
        'SELECT id,alt,width,height,bytes,created_at FROM media_assets WHERE restaurant_id=$1 ORDER BY created_at DESC',
        [restaurantId]
      )
    ).rows;
  },
  async availability(restaurantId: string, itemId: string) {
    const row = (
      await pool.query(
        'SELECT a.content FROM menu_items i LEFT JOIN item_availability a ON a.restaurant_id=i.restaurant_id AND a.item_id=i.id WHERE i.restaurant_id=$1 AND i.id=$2',
        [restaurantId, itemId]
      )
    ).rows[0];
    if (!row) throw new NotFoundError('Save this item first');
    return row.content ?? { soldOut: false, enabled: true, serviceModes: ['dine_in'], hours: null };
  },
  async websiteIndex() {
    return (
      await pool.query(
        `SELECT r.slug,v.content FROM restaurants r JOIN website_publications p ON p.restaurant_id=r.id JOIN website_revisions v ON v.id=p.revision_id WHERE r.status IN ('active','onboarding')`
      )
    ).rows;
  },
  async current(slug: string) {
    const row = (
      await pool.query(
        `SELECT v.id,v.content,v.created_at,r.id AS restaurant_id FROM restaurants r JOIN website_publications p ON p.restaurant_id=r.id JOIN website_revisions v ON v.id=p.revision_id WHERE r.slug=$1 AND r.status IN ('active','onboarding')`,
        [slug]
      )
    ).rows[0];
    if (!row) throw new NotFoundError('Published website not found');
    return row as { id: string; content: Draft; created_at: string; restaurant_id: string };
  },
};
