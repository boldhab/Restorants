import { pool } from '../../database/pool.js';

export class AuthRepository {
  async findUserByEmail(email: string, client: Pick<import('pg').PoolClient, 'query'> = pool) {
    const res = await client.query(
      `SELECT *, EXISTS (SELECT 1 FROM platform_administrators pa WHERE pa.user_id=users.id) AS is_platform_admin FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    return res.rows[0] || null;
  }

  async findUserById(id: string, client: Pick<import('pg').PoolClient, 'query'> = pool) {
    const res = await client.query(
      `SELECT id, email, full_name, phone, is_email_verified, EXISTS (SELECT 1 FROM platform_administrators pa WHERE pa.user_id=users.id) AS is_platform_admin, created_at FROM users WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async createUser(
    {
      email,
      passwordHash,
      fullName,
      phone = null,
    }: { email: string; passwordHash: string; fullName: string; phone?: string | null },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const res = await client.query(
      `INSERT INTO users (email, password_hash, full_name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, phone, is_email_verified, is_platform_admin, created_at`,
      [email.toLowerCase(), passwordHash, fullName, phone]
    );
    return res.rows[0];
  }

  async updateUserVerification(
    userId: string,
    isVerified = true,
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    await client.query(
      `UPDATE users SET is_email_verified = $2, updated_at = NOW() WHERE id = $1`,
      [userId, isVerified]
    );
  }

  async updateUserPassword(
    userId: string,
    passwordHash: string,
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    await client.query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [
      userId,
      passwordHash,
    ]);
  }

  async createSession(
    {
      userId,
      tokenHash,
      ipAddress,
      userAgent,
      expiresAt,
    }: {
      userId: string;
      tokenHash: string;
      ipAddress?: string;
      userAgent?: string;
      expiresAt: Date;
    },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const res = await client.query(
      `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, expires_at, created_at`,
      [userId, tokenHash, ipAddress, userAgent, expiresAt]
    );
    return res.rows[0];
  }

  async revokeSession(sessionId: string, client: Pick<import('pg').PoolClient, 'query'> = pool) {
    await client.query(`UPDATE sessions SET revoked_at = NOW() WHERE id = $1`, [sessionId]);
  }

  async revokeAllUserSessions(
    userId: string,
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    await client.query(
      `UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }

  async createVerificationToken(
    { userId, tokenHash, expiresAt }: { userId: string; tokenHash: string; expiresAt: Date },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const res = await client.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, expires_at`,
      [userId, tokenHash, expiresAt]
    );
    return res.rows[0];
  }

  async consumeVerificationToken(
    tokenHash: string,
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    // Atomic consumption: only succeeds if token is not already consumed and not expired
    const res = await client.query(
      `UPDATE email_verification_tokens
       SET consumed_at = NOW()
       WHERE token_hash = $1
         AND consumed_at IS NULL
         AND expires_at > NOW()
       RETURNING id, user_id`,
      [tokenHash]
    );
    return res.rows[0] || null;
  }

  async createPasswordResetToken(
    { userId, tokenHash, expiresAt }: { userId: string; tokenHash: string; expiresAt: Date },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    const res = await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, expires_at`,
      [userId, tokenHash, expiresAt]
    );
    return res.rows[0];
  }

  async consumePasswordResetToken(
    tokenHash: string,
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    // Atomic consumption
    const res = await client.query(
      `UPDATE password_reset_tokens
       SET consumed_at = NOW()
       WHERE token_hash = $1
         AND consumed_at IS NULL
         AND expires_at > NOW()
       RETURNING id, user_id`,
      [tokenHash]
    );
    return res.rows[0] || null;
  }

  async getUserMemberships(userId: string, client: Pick<import('pg').PoolClient, 'query'> = pool) {
    const res = await client.query(
      `SELECT 
         m.id AS membership_id,
         m.status AS membership_status,
         r.id AS restaurant_id,
         r.name AS restaurant_name,
         r.slug AS restaurant_slug,
         r.status AS restaurant_status,
         r.currency,
         r.timezone,
         COALESCE(ARRAY_AGG(DISTINCT ro.name) FILTER (WHERE ro.name IS NOT NULL), '{}') AS roles,
         COALESCE(ARRAY_AGG(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM restaurant_memberships m
       INNER JOIN restaurants r ON m.restaurant_id = r.id
       LEFT JOIN membership_roles mr ON m.id = mr.membership_id
       LEFT JOIN roles ro ON mr.role_id = ro.id
       LEFT JOIN role_permissions rp ON ro.id = rp.role_id
       LEFT JOIN permissions p ON rp.permission_id = p.id
       WHERE m.user_id = $1 AND m.status = 'active'
       GROUP BY m.id, r.id
       ORDER BY r.name ASC`,
      [userId]
    );
    return res.rows;
  }

  async createAuditLog(
    {
      actorId,
      restaurantId = null,
      action,
      targetType = null,
      targetId = null,
      metadata = {},
      requestId = null,
      ipAddress = null,
    }: {
      actorId: string;
      restaurantId?: string | null;
      action: string;
      targetType?: string | null;
      targetId?: string | null;
      metadata?: Record<string, unknown>;
      requestId?: string | null;
      ipAddress?: string | null;
    },
    client: Pick<import('pg').PoolClient, 'query'> = pool
  ) {
    await client.query(
      `INSERT INTO audit_logs (actor_id, restaurant_id, action, target_type, target_id, metadata, request_id, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actorId,
        restaurantId,
        action,
        targetType,
        targetId,
        JSON.stringify(metadata),
        requestId,
        ipAddress,
      ]
    );
  }
}

export const authRepository = new AuthRepository();
