import { customerCommerceRouter,operationsRouter,platformRouter,accountRouter } from '../modules/commerce/commerce.routes.js';
import { publishingRouter, publicWebsiteRouter } from '../modules/publishing/publishing.routes.js';
import { env } from '../config/env.js';
import { emailService } from '../integrations/email/email-service.js';
import { generalLimiter } from '../middleware/rate-limit.js';
import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { restaurantsRouter } from '../modules/restaurants/restaurants.routes.js';

export const apiRouter = Router();

// Mount health and readiness checks
apiRouter.use('/', healthRouter);

apiRouter.use('/commerce/:restaurantId',customerCommerceRouter);
apiRouter.use('/operations/:restaurantId',operationsRouter);
apiRouter.use('/platform',platformRouter);
apiRouter.use('/customer',accountRouter);

// Mount business feature routers
apiRouter.use('/auth', generalLimiter, authRouter);
apiRouter.use('/restaurants/:restaurantId', (req, res, next) => {
  if (/^\/(website|menu|media|settings)(\/|$)/.test(req.path))
    return publishingRouter(req, res, next);
  next();
});
apiRouter.use('/restaurants', generalLimiter, restaurantsRouter);
apiRouter.use('/public/restaurants', generalLimiter, publicWebsiteRouter);
apiRouter.get('/public/website-index', generalLimiter, async (_req, res, next) => {
  try {
    const { websiteIndex } = await import('../modules/publishing/publishing.service.js');
    res.json(await websiteIndex());
  } catch (error) {
    next(error);
  }
});

// Explicit local-only capture; never registered with a production environment.
if (!env.IS_PROD && env.EMAIL_PROVIDER === 'memory') {
  apiRouter.get('/dev/emails', (req, res) => {
    res.json({
      emails:
        typeof req.query.email === 'string'
          ? emailService.getSentEmails().filter((e) => e.to === req.query.email)
          : emailService.getSentEmails(),
    });
  });
}
