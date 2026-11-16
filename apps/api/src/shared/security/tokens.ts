import crypto from 'crypto';

export function generateOpaqueToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('hex');
}

export function hashToken(token: string) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function hashPayload(payload: unknown) {
  const normalized = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
