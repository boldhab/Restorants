import { commerceRepository as repo } from './commerce.repository.js';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { env } from '../../config/env.js';
import { hashToken } from '../../shared/security/tokens.js';
import { CsrfError, NotFoundError } from '../../shared/errors/app-error.js';
import type { Scope } from './commerce.service.js';
export const scopes = new WeakMap<Request, Scope>();
export async function guestSession(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.uuid().parse(req.params.restaurantId);
    const name = 'zq_guest_' + id.replaceAll('-', '');
    let token = req.signedCookies?.[name];
    let session =
      typeof token === 'string'
        ? (await repo.execute(pool, 'selectCommerceSessions', [id, hashToken(token)])).rows[0]
        : null;
    if (!session) {
      if (req.method !== 'GET' || req.path !== '/session')
        throw new CsrfError('Initialize your secure restaurant session first');
      if (!(await repo.execute(pool, 'selectRestaurants2', [id])).rowCount)
        throw new NotFoundError('Restaurant not found');
      token = randomBytes(32).toString('hex');
      session = (await repo.execute(pool, 'insertCommerceSessions', [id, hashToken(token)]))
        .rows[0];
      res.cookie(name, token, {
        signed: true,
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/api/v1/commerce/' + id,
        maxAge: 30 * 86400000,
      });
    }
    const csrf = createHmac('sha256', env.COOKIE_SECRET)
      .update('guest:' + token)
      .digest('hex');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const header = req.get('X-Guest-CSRF') ?? '';
      if (
        !/^[a-f0-9]{64}$/.test(header) ||
        !timingSafeEqual(Buffer.from(header), Buffer.from(csrf))
      )
        throw new CsrfError('Invalid guest CSRF token');
    }
    scopes.set(req, { restaurantId: id, sessionId: session.id, userId: req.user?.id });
    res.locals.guestCsrf = csrf;
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  } catch (e) {
    next(e);
  }
}
