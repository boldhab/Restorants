import { generalLimiter } from '../../middleware/rate-limit.js';
import { catalogRouter } from './catalog.routes.js';
import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  saveDraftSchema,
  availabilitySchema,
  configurationSchema,
  readiness,
} from '@zayqora/contracts';
import { authenticate, requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { resolveTenant } from '../../middleware/resolve-tenant.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { ValidationError } from '../../shared/errors/app-error.js';
import * as service from './publishing.service.js';
import * as media from './media.service.js';
const handler =
  (
    fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<unknown>
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const version = z.object({ version: z.number().int().min(0) }).strict();
export const publishingRouter = Router({ mergeParams: true });
publishingRouter.use(
  generalLimiter,
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  resolveTenant(),
  authorize('restaurant:update')
);
publishingRouter.get(
  '/website/draft',
  handler(async (req, res) => res.json(await service.readDraft(req.tenantContext!.restaurantId)))
);
publishingRouter.patch(
  '/website/draft',
  validate(saveDraftSchema),
  handler(async (req, res) =>
    res.json(
      await service.saveDraft(req.tenantContext!.restaurantId, req.body.version, req.body.draft)
    )
  )
);
publishingRouter.get(
  '/website/preview',
  handler(async (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.json(await service.readDraft(req.tenantContext!.restaurantId));
  })
);
publishingRouter.post(
  '/website/validate',
  handler(async (req, res) =>
    res.json({
      issues: readiness((await service.readDraft(req.tenantContext!.restaurantId)).draft),
    })
  )
);
publishingRouter.post(
  '/website/publish',
  validate(version),
  handler(async (req, res) =>
    res.json(await service.publish(req.tenantContext!.restaurantId, req.body.version, req.user!.id))
  )
);
publishingRouter.post(
  '/website/unpublish',
  validate(version),
  handler(async (req, res) =>
    res.json(
      await service.unpublish(req.tenantContext!.restaurantId, req.body.version, req.user!.id)
    )
  )
);
publishingRouter.patch(
  '/menu/items/:itemId/availability',
  validate(availabilitySchema),
  handler(async (req, res) =>
    res.json(
      await service.setAvailability(
        req.tenantContext!.restaurantId,
        z.uuid().parse(req.params.itemId),
        req.body
      )
    )
  )
);
publishingRouter.post(
  '/media',
  express.raw({ type: 'application/octet-stream', limit: '5mb' }),
  handler(async (req, res) => {
    if (!Buffer.isBuffer(req.body))
      throw new ValidationError('Send binary image bytes as application/octet-stream');
    const alt = z
      .string()
      .trim()
      .min(1)
      .max(300)
      .safeParse(decodeURIComponent(req.get('x-image-alt') || ''));
    if (!alt.success) throw new ValidationError('Provide image alternative text in X-Image-Alt');
    res
      .status(201)
      .json(await media.uploadImage(req.tenantContext!.restaurantId, req.body, alt.data));
  })
);
publishingRouter.delete(
  '/media/:assetId',
  handler(async (req, res) =>
    res.json(
      await media.deleteImage(req.tenantContext!.restaurantId, z.uuid().parse(req.params.assetId))
    )
  )
);
publishingRouter.get(
  '/media/:assetId',
  handler(async (req, res) =>
    res
      .type('webp')
      .send(
        await media.imageBytes(z.uuid().parse(req.params.assetId), req.tenantContext!.restaurantId)
      )
  )
);
export const publicWebsiteRouter = Router();
publicWebsiteRouter.get(
  '/:slug',
  handler(async (req, res) => res.json(await service.publicWebsite(String(req.params.slug))))
);
publicWebsiteRouter.get(
  '/:slug/menu',
  handler(async (req, res) => res.json(await service.publicWebsite(String(req.params.slug))))
);
publicWebsiteRouter.post(
  '/:slug/menu/configuration',
  validate(configurationSchema),
  handler(async (req, res) =>
    res.json(
      await service.validateConfiguration(
        String(req.params.slug),
        req.body,
        typeof req.query.mode === 'string' ? req.query.mode : undefined
      )
    )
  )
);
publicWebsiteRouter.get(
  '/:slug/media/:assetId',
  handler(async (req, res) =>
    res
      .type('webp')
      .send(
        await media.imageBytes(
          z.uuid().parse(req.params.assetId),
          undefined,
          String(req.params.slug)
        )
      )
  )
);
publishingRouter.get(
  '/menu/items/:itemId/availability',
  handler(async (req, res) =>
    res.json(
      await service.readAvailability(
        req.tenantContext!.restaurantId,
        z.uuid().parse(req.params.itemId)
      )
    )
  )
);

publishingRouter.use(catalogRouter);
