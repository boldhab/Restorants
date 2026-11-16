import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const boolean = z.enum(['true', 'false']).transform((v) => v === 'true');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (v) => ['postgres:', 'postgresql:'].includes(new URL(v).protocol),
      'Must be a PostgreSQL URL'
    )
    .optional(),
  PGHOST: z.string().default('127.0.0.1'),
  PGPORT: z.coerce.number().int().min(1).max(65535).default(5432),
  PGUSER: z.string().default('postgres'),
  PGPASSWORD: z.string().default('1234'),
  PGDATABASE: z.string().default('zayqora_dev'),
  PGSSL: boolean.default(false),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((s) => s.trim()))
    .pipe(z.array(z.url({ protocol: /^https?$/ })))
    .transform((v) => v.map((s) => new URL(s).origin)),
  APP_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(32).default('development-session-secret-change-in-production'),
  COOKIE_SECRET: z.string().min(32).default('development-cookie-secret-change-in-production'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  COOKIE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('zayqora_sid'),
  COOKIE_SECURE: boolean.default(false),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict']).default('lax'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  EMAIL_PROVIDER: z.enum(['memory', 'smtp']).default('memory'),
  EMAIL_FROM: z.string().default('ZAYQORA <no-reply@zayqora.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: boolean.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});
const result = schema.safeParse(process.env);
if (!result.success)
  throw new Error(
    '[ZAYQORA CONFIG ERROR] ' +
      result.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')
  );
const config = result.data;
const isProd = config.NODE_ENV === 'production';
if (
  isProd &&
  (!config.DATABASE_URL ||
    !config.COOKIE_SECURE ||
    !config.APP_URL.startsWith('https://') ||
    config.ALLOWED_ORIGINS.some((o) => !o.startsWith('https://')) ||
    config.EMAIL_PROVIDER !== 'smtp' ||
    !config.SMTP_HOST ||
    config.SESSION_SECRET.includes('development') ||
    config.COOKIE_SECRET.includes('development') ||
    config.SESSION_SECRET === config.COOKIE_SECRET)
) {
  throw new Error(
    '[ZAYQORA CONFIG ERROR] Production requires DATABASE_URL, secure cookies, HTTPS URLs, independent secrets, and SMTP delivery.'
  );
}
if (config.EMAIL_PROVIDER === 'smtp' && !config.SMTP_HOST)
  throw new Error('[ZAYQORA CONFIG ERROR] SMTP_HOST is required for SMTP delivery.');
export const env = Object.freeze({
  ...config,
  IS_PROD: isProd,
  IS_TEST: config.NODE_ENV === 'test',
  DATABASE_URL:
    config.DATABASE_URL ||
    `postgres://${encodeURIComponent(config.PGUSER)}:${encodeURIComponent(config.PGPASSWORD)}@${config.PGHOST}:${config.PGPORT}/${config.PGDATABASE}`,
});
