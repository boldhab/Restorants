import cors from 'cors';
import { ForbiddenError } from '../shared/errors/app-error.js';
import { env } from './env.js';

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. curl, server-to-server, unit tests)
    if (!origin) {
      return callback(null, true);
    }
    if (env.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new ForbiddenError('Origin is not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    'X-CSRF-Token',
    'Idempotency-Key',
  ],
  exposedHeaders: ['X-Request-Id', 'X-CSRF-Token'],
  maxAge: 86400,
});
