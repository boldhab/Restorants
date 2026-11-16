import { Router } from 'express';
import { restaurantsController } from './restaurants.controller.js';
import { authenticate, requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { resolveTenant } from '../../middleware/resolve-tenant.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { createRestaurantSchema, updateRestaurantSchema, PermissionCode } from '@zayqora/contracts';

export const restaurantsRouter = Router();

// Create new restaurant (must be authenticated and verified)
restaurantsRouter.post(
  '/',
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  validate(createRestaurantSchema),
  (req, res, next) => restaurantsController.create(req, res, next)
);

// List user's active restaurants
restaurantsRouter.get('/', authenticate, requireAuth, (req, res, next) =>
  restaurantsController.list(req, res, next)
);

// Tenant-scoped routes
restaurantsRouter.get(
  '/:restaurantId',
  authenticate,
  requireAuth,
  resolveTenant('restaurantId'),
  authorize(PermissionCode.RESTAURANT_READ),
  (req, res, next) => restaurantsController.getById(req, res, next)
);

restaurantsRouter.patch(
  '/:restaurantId',
  authenticate,
  requireAuth,
  resolveTenant('restaurantId'),
  authorize(PermissionCode.RESTAURANT_UPDATE),
  validate(updateRestaurantSchema),
  (req, res, next) => restaurantsController.update(req, res, next)
);

restaurantsRouter.get(
  '/:restaurantId/branches',
  authenticate,
  requireAuth,
  resolveTenant('restaurantId'),
  authorize(PermissionCode.RESTAURANT_READ),
  (req, res, next) => restaurantsController.getBranches(req, res, next)
);
