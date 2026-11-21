import { hashPassword } from '../../src/shared/security/passwords.js';
import { RoleCode } from '@zayqora/contracts';

export async function seedDemoRestaurants(client: import('pg').PoolClient) {
  const defaultPasswordHash = await hashPassword('Password123!');

  // Helper to upsert user
  async function upsertUser(
    email: string,
    fullName: string,
    isVerified = true,
    isPlatformAdmin = false
  ) {
    const res = await client.query(
      `INSERT INTO users (email, password_hash, full_name, is_email_verified, is_platform_admin)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ((LOWER(email))) DO UPDATE
       SET full_name = EXCLUDED.full_name, is_email_verified = EXCLUDED.is_email_verified, is_platform_admin = EXCLUDED.is_platform_admin
       RETURNING id`,
      [email.toLowerCase(), defaultPasswordHash, fullName, isVerified, isPlatformAdmin]
    );
    return res.rows[0].id;
  }

  // Helper to get system role id
  async function getRoleId(name: string) {
    const res = await client.query(
      `SELECT id FROM roles WHERE name = $1 AND restaurant_id IS NULL`,
      [name]
    );
    return res.rows[0]?.id;
  }

  const ownerRoleId = await getRoleId(RoleCode.OWNER);
  const managerRoleId = await getRoleId(RoleCode.MANAGER);
  const staffRoleId = await getRoleId(RoleCode.STAFF);

  // 1. Create Users
  const owner1Id = await upsertUser('owner1@example.com', 'Marco Bellini');
  const owner2Id = await upsertUser('owner2@example.com', 'Kenji Tanaka');
  const owner3Id = await upsertUser('owner3@example.com', 'Antoine Dubois');
  const owner4Id = await upsertUser('owner4@example.com', 'Carlos Mendoza');
  const staffId = await upsertUser('staff@example.com', 'Luca Rossi');
  const staff3Id = await upsertUser('staff3@example.com', 'Camille Laurent');
  const staff4Id = await upsertUser('staff4@example.com', 'Elena Gomez');
  const multiTenantId = await upsertUser('multitenant@example.com', 'Sarah Jenkins');
  const adminId = await upsertUser('admin@example.com', 'Platform Admin', true, true);

  await client.query(
    'INSERT INTO platform_administrators(user_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [adminId]
  );

  // Helper to upsert restaurant with default branch
  async function upsertRestaurant(
    name: string,
    slug: string,
    category: string,
    phone: string,
    email: string,
    country: string,
    city: string,
    address: string,
    currency: string,
    timezone: string
  ) {
    const res = await client.query(`SELECT id FROM restaurants WHERE slug = $1`, [slug]);
    let restaurantId;
    if (res.rows.length === 0) {
      const insRes = await client.query(
        `INSERT INTO restaurants (name, slug, category, phone, email, country, city, address, currency, timezone, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
         RETURNING id`,
        [name, slug, category, phone, email, country, city, address, currency, timezone]
      );
      restaurantId = insRes.rows[0].id;

      // Default branch
      await client.query(
        `INSERT INTO branches (restaurant_id, name, slug, is_default, city, address)
         VALUES ($1, 'Main Branch', 'main', TRUE, $2, $3)`,
        [restaurantId, city, address]
      );
    } else {
      restaurantId = res.rows[0].id;
    }
    return restaurantId;
  }

  // 2. Create Restaurants
  const rest1Id = await upsertRestaurant(
    'Bella Italia',
    'bella-italia',
    'Italian Restaurant',
    '+1 555-0101',
    'contact@bellaitalia.local',
    'United States',
    'New York',
    '123 Mulberry St',
    'USD',
    'America/New_York'
  );

  const rest2Id = await upsertRestaurant(
    'Tokyo Ramen',
    'tokyo-ramen',
    'Japanese Ramen',
    '+1 555-0202',
    'contact@tokyoramen.local',
    'United States',
    'San Francisco',
    '456 Japantown Blvd',
    'USD',
    'America/Los_Angeles'
  );

  const rest3Id = await upsertRestaurant(
    'Le Petit Bistro',
    'le-petit-bistro',
    'French Bistro',
    '+1 555-0303',
    'contact@lepetitbistro.local',
    'United States',
    'Boston',
    '78 Newbury St',
    'USD',
    'America/New_York'
  );

  const rest4Id = await upsertRestaurant(
    'Taco Fiesta',
    'taco-fiesta',
    'Mexican Taqueria',
    '+1 555-0404',
    'contact@tacofiesta.local',
    'United States',
    'Austin',
    '1024 S Congress Ave',
    'USD',
    'America/Chicago'
  );

  // Helper to assign membership and role
  async function assignMembership(restaurantId: string, userId: string, roleId: string) {
    const mRes = await client.query(
      `INSERT INTO restaurant_memberships (restaurant_id, user_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (restaurant_id, user_id) DO UPDATE SET status = 'active'
       RETURNING id`,
      [restaurantId, userId]
    );
    const membershipId = mRes.rows[0].id;

    if (roleId) {
      await client.query(
        `INSERT INTO membership_roles (membership_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [membershipId, roleId]
      );
    }
  }

  // 3. Assign Memberships
  // Owner 1 -> Bella Italia (Owner)
  await assignMembership(rest1Id, owner1Id, ownerRoleId);

  // Owner 2 -> Tokyo Ramen (Owner)
  await assignMembership(rest2Id, owner2Id, ownerRoleId);

  // Staff -> Bella Italia (Staff only)
  await assignMembership(rest1Id, staffId, staffRoleId);

  // Multi-tenant -> Bella Italia (Manager) & Tokyo Ramen (Staff)
  await assignMembership(rest1Id, multiTenantId, managerRoleId);
  await assignMembership(rest2Id, multiTenantId, staffRoleId);

  // Owner 3 & Staff 3 -> Le Petit Bistro
  await assignMembership(rest3Id, owner3Id, ownerRoleId);
  await assignMembership(rest3Id, staff3Id, staffRoleId);

  // Owner 4 & Staff 4 -> Taco Fiesta
  await assignMembership(rest4Id, owner4Id, ownerRoleId);
  await assignMembership(rest4Id, staff4Id, staffRoleId);
}
