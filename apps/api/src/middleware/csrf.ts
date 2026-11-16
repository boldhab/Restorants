import { createHmac, timingSafeEqual } from 'node:crypto';
import { CsrfError } from '../shared/errors/app-error.js';
import { generateCsrfToken } from '../shared/security/tokens.js';
import { env } from '../config/env.js';

export const CSRF_COOKIE_NAME = 'zayqora_csrf';

/**
 * Sets CSRF cookie if not present or requested
 */
function sign(nonce: string, sessionToken: string): string {
  return createHmac('sha256', env.COOKIE_SECRET)
    .update(nonce + ':' + sessionToken)
    .digest('hex');
}
export function setCsrfCookie(res: import('express').Response, sessionToken: string) {
  const nonce = generateCsrfToken();
  const token = nonce + '.' + sign(nonce, sessionToken);
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by client JS to send in X-CSRF-Token header
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 3600 * 1000,
  });
  return token;
}

/**
 * Validates CSRF on state-changing requests when session cookie is present
 */
export function csrfProtection(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  // Safe HTTP methods do not change state
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Reject cross-site form submissions even before a session exists (login CSRF).
  const origin = req.headers.origin;
  if (
    (origin && !env.ALLOWED_ORIGINS.includes(origin)) ||
    req.headers['sec-fetch-site'] === 'cross-site'
  )
    return next(new CsrfError());

  // Check if session cookie is present
  const sessionCookie = req.cookies?.[env.COOKIE_NAME];
  if (!sessionCookie) {
    // Unauthenticated requests (e.g. initial login, register) don't have session yet,
    // but ensure CSRF token cookie exists or allow public state changes
    return next();
  }

  // Session cookie is present: verify CSRF double-submit token
  const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME];
  const csrfHeader = req.headers['x-csrf-token'];

  const [nonce, signature] = typeof csrfHeader === 'string' ? csrfHeader.split('.') : [];
  const expected = nonce ? sign(nonce, sessionCookie) : '';
  if (
    !csrfCookie ||
    csrfCookie !== csrfHeader ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return next(new CsrfError('Invalid or missing CSRF token'));
  }

  next();
}
