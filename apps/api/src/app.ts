import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { corsMiddleware } from './config/cors.js';
import { requestId } from './middleware/request-id.js';
import { csrfProtection } from './middleware/csrf.js';
import { notFound } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();

  // Trust proxy if configured (e.g. behind nginx / traefik / render / heroku)
  if (env.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: env.IS_PROD ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // Request ID
  app.use(requestId);

  // CORS
  app.use(corsMiddleware);

  // Cookie parsing with secret
  app.use(cookieParser(env.COOKIE_SECRET));

  // JSON Body parsing with explicit size limit (1MB)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // HTTP Request Logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.originalUrl !== '/api/v1/health') {
        logger.info(
          {
            requestId: req.id,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: duration,
            ip: req.ip,
          },
          'HTTP request completed'
        );
      }
    });
    next();
  });

  // CSRF Protection for state-changing cookie requests
  app.use(csrfProtection);

  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Mount API v1
  app.use('/api/v1', apiRouter);

  // Private identity and tenant responses must never enter shared caches.
  // 404 handler
  app.use(notFound);

  // Central error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
