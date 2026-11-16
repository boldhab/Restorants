import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.IS_TEST ? 'silent' : env.IS_PROD ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      'password',
      'token',
      'password_hash',
      'token_hash',
      'secret',
      'new_password',
      '*.password',
      '*.token',
      'body.password',
      'body.token',
    ],
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
