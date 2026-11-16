import rateLimit from 'express-rate-limit';
import { RateLimitError } from '../shared/errors/app-error.js';
import { env } from '../config/env.js';

const handler = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) => {
  next(new RateLimitError());
};

// In test environment, make limits very high to prevent flakiness
const multiplier = env.IS_TEST ? 1000 : 1;

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300 * multiplier,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20 * multiplier,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5 * multiplier,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
