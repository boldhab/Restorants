import { pool } from '../database/pool.js';
import { hashToken } from '../shared/security/tokens.js';
import { env } from '../config/env.js';
import { UnauthorizedError, UnverifiedEmailError } from '../shared/errors/app-error.js';

export async function authenticate(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];

    if (!token) {
      req.user = undefined;
      req.session = undefined;
      return next();
    }

    const tokenHash = hashToken(token);

    const result = await pool.query(
      `SELECT 
         s.id AS session_id,
         s.user_id,
         s.expires_at,
         s.revoked_at,
         u.id,
         u.email,
         u.full_name,
         u.phone,
         u.is_email_verified,
         EXISTS (SELECT 1 FROM platform_administrators pa WHERE pa.user_id = u.id) AS is_platform_admin
       FROM sessions s
       INNER JOIN users u ON s.user_id = u.id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      req.user = undefined;
      req.session = undefined;
      return next();
    }

    const row = result.rows[0];
    req.user = {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      phone: row.phone,
      is_email_verified: row.is_email_verified,
      is_platform_admin: row.is_platform_admin,
    };

    req.session = {
      id: row.session_id,
      user_id: row.user_id,
      expires_at: row.expires_at,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required. Please log in.'));
  }
  next();
}

export function requireVerifiedEmail(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required.'));
  }
  if (!req.user.is_email_verified) {
    return next(new UnverifiedEmailError());
  }
  next();
}
