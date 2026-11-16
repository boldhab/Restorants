import type { CreateRestaurantInput, UpdateRestaurantInput } from '@zayqora/contracts';
import type { TenantContext } from '../../types/express.js';
import { pool } from '../../database/pool.js';
import { RoleCode } from '@zayqora/contracts';

export class RestaurantsRepository {
  async findRestaurantById(
    tenant: TenantContext,
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const res = await client.query(`SELECT * FROM restaurants WHERE id = $1`, [
      tenant.restaurantId,
    ]);
    return res.rows[0] || null;
  }

  async findRestaurantBySlug(slug: string, client: Pick<import('pg').PoolClient, 'query'> = pool) {
    const res = await client.query(`SELECT * FROM restaurants WHERE slug = $1`, [slug]);
    return res.rows[0] || null;
  }

  async createRestaurant(
    data: CreateRestaurantInput & { status?: string },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const {
      name,
      slug,
      category,
      phone,
      email,
      country,
      city,
      address,
      currency,
      timezone,
      status = 'onboarding',
    } = data;
    const res = await client.query(
      `INSERT INTO restaurants (name, slug, category, phone, email, country, city, address, currency, timezone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [name, slug, category, phone, email, country, city, address, currency, timezone, status]
    );
    return res.rows[0];
  }

  async updateRestaurant(
    tenant: TenantContext,
    data: UpdateRestaurantInput,
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }

    if (fields.length === 0) {
      return this.findRestaurantById(tenant, client);
    }

    fields.push(`updated_at = NOW()`);
    values.push(tenant.restaurantId);

    const query = `
      UPDATE restaurants
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const res = await client.query(query, values);
    return res.rows[0];
  }

  async createBranch(
    data: {
      restaurantId: string;
      name: string;
      slug: string;
      isDefault?: boolean;
      phone?: string | null;
      city?: string | null;
      address?: string | null;
    },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const {
      restaurantId,
      name,
      slug,
      isDefault = false,
      phone = null,
      city = null,
      address = null,
    } = data;
    const res = await client.query(
      `INSERT INTO branches (restaurant_id, name, slug, is_default, phone, city, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [restaurantId, name, slug, isDefault, phone, city, address]
    );
    return res.rows[0];
  }

  async getBranchesByRestaurantId(
    tenant: TenantContext,
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const res = await client.query(
      `SELECT * FROM branches WHERE restaurant_id = $1 ORDER BY is_default DESC, name ASC`,
      [tenant.restaurantId]
    );
    return res.rows;
  }

  async createMembership(
    {
      restaurantId,
      userId,
      status = 'active',
    }: { restaurantId: string; userId: string; status?: string },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const res = await client.query(
      `INSERT INTO restaurant_memberships (restaurant_id, user_id, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [restaurantId, userId, status]
    );
    return res.rows[0];
  }

  async assignRoleToMembership(
    { membershipId, roleId }: { membershipId: string; roleId: string },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    await client.query(
      `INSERT INTO membership_roles (membership_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [membershipId, roleId]
    );
  }

  async getOwnerRoleId(client: Pick<import('pg').PoolClient, 'query'> = pool) {
    const res = await client.query(
      `SELECT id FROM roles WHERE name = $1 AND restaurant_id IS NULL`,
      [RoleCode.OWNER]
    );
    return res.rows[0]?.id;
  }

  async getUserRestaurants(userId: string, client: Pick<import('pg').PoolClient, 'query'> = pool) {
    const res = await client.query(
      `SELECT 
         r.*,
         m.id AS membership_id,
         m.status AS membership_status,
         COALESCE(ARRAY_AGG(DISTINCT ro.name) FILTER (WHERE ro.name IS NOT NULL), '{}') AS roles
       FROM restaurants r
       INNER JOIN restaurant_memberships m ON r.id = m.restaurant_id
       LEFT JOIN membership_roles mr ON m.id = mr.membership_id
       LEFT JOIN roles ro ON mr.role_id = ro.id
       WHERE m.user_id = $1 AND m.status = 'active'
       GROUP BY r.id, m.id
       ORDER BY r.name ASC`,
      [userId]
    );
    return res.rows;
  }

  // Idempotency support
  async getIdempotencyRecord(
    userId: string,
    key: string,
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const res = await client.query(
      `SELECT * FROM idempotency_keys WHERE user_id = $1 AND key = $2 AND expires_at > NOW()`,
      [userId, key]
    );
    return res.rows[0] || null;
  }

  async saveIdempotencyRecord(
    {
      userId,
      key,
      requestHash,
      responseStatus,
      responseBody,
      ttlHours = 24,
    }: {
      userId: string;
      key: string;
      requestHash: string;
      responseStatus: number;
      responseBody: unknown;
      ttlHours?: number;
    },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
    await client.query(
      `INSERT INTO idempotency_keys (user_id, key, request_hash, response_status, response_body, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, key) DO UPDATE
       SET request_hash = EXCLUDED.request_hash, response_status = EXCLUDED.response_status, response_body = EXCLUDED.response_body, expires_at = EXCLUDED.expires_at`,
      [userId, key, requestHash, responseStatus, JSON.stringify(responseBody), expiresAt]
    );
  }
}

export const restaurantsRepository = new RestaurantsRepository();
