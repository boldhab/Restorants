import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const moduleUrl = new URL('../../src/config/env.ts', import.meta.url).href;
function config(overrides: Record<string, string>) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', '-e', `import(${JSON.stringify(moduleUrl)})`],
    { env: { ...process.env, ...overrides }, encoding: 'utf8' }
  );
}
it('rejects invalid ports and unsafe production settings with clear errors', () => {
  const badPort = config({ PORT: 'not-a-port' });
  assert.notEqual(badPort.status, 0);
  assert.match(badPort.stderr, /CONFIG ERROR.*PORT/);
  const prod = config({ NODE_ENV: 'production', EMAIL_PROVIDER: 'memory', COOKIE_SECURE: 'false' });
  assert.notEqual(prod.status, 0);
  assert.match(prod.stderr, /Production requires/);
});
it('accepts explicit secure production configuration without connecting to external services', () => {
  const result = config({
    NODE_ENV: 'production',
    PORT: '4000',
    DATABASE_URL: 'postgres://user:placeholder@localhost:5432/database',
    APP_URL: 'https://staging.example.com',
    ALLOWED_ORIGINS: 'https://staging.example.com',
    SESSION_SECRET: 'x'.repeat(48),
    COOKIE_SECRET: 'y'.repeat(48),
    COOKIE_SECURE: 'true',
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.example.com',
  });
  assert.equal(result.status, 0, result.stderr);
});
