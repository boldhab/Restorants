import { ValidationError } from '../../shared/errors/app-error.js';
import { restaurantsService } from './restaurants.service.js';

export class RestaurantsController {
  async create(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      const idempotencyKey = req.get('idempotency-key');
      if (idempotencyKey && !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey))
        throw new ValidationError('Invalid Idempotency-Key header');
      const result = await restaurantsService.createRestaurant(req.user!.id, req.body, {
        idempotencyKey,
        requestId: req.id,
        ipAddress: req.ip,
      });

      res.status(result.statusCode).json(result.body);
    } catch (err) {
      next(err);
    }
  }

  async list(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      const restaurants = await restaurantsService.getUserRestaurants(req.user!.id);
      res.status(200).json({ restaurants });
    } catch (err) {
      next(err);
    }
  }

  async getById(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      // req.tenantContext ensures caller is an active member in this restaurant
      const restaurant = await restaurantsService.getRestaurantById(req.tenantContext!);
      res.status(200).json({
        restaurant,
        roles: req.tenantContext!.roles,
        permissions: req.tenantContext!.permissions,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      // req.tenantContext ensures caller has required permission
      const updated = await restaurantsService.updateRestaurant(req.tenantContext!, req.body, {
        userId: req.user!.id,
        requestId: req.id,
        ipAddress: req.ip,
      });
      res.status(200).json({ restaurant: updated });
    } catch (err) {
      next(err);
    }
  }

  async getBranches(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      const branches = await restaurantsService.getBranches(req.tenantContext!);
      res.status(200).json({ branches });
    } catch (err) {
      next(err);
    }
  }
}

export const restaurantsController = new RestaurantsController();
