import type { TenantContext } from '../../types/express.js';
import type { CreateRestaurantInput, UpdateRestaurantInput } from '@zayqora/contracts';
interface ServiceContext {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  idempotencyKey?: string;
  userId?: string;
  previousSessionId?: string;
}
import { restaurantsRepository } from './restaurants.repository.js';
import { authRepository } from '../auth/auth.repository.js';
import { withTransaction } from '../../database/transaction.js';
import {
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
} from '../../shared/errors/app-error.js';
import { hashPayload } from '../../shared/security/tokens.js';

export class RestaurantsService {
  async createRestaurant(
    userId: string,
    data: CreateRestaurantInput,
    context: ServiceContext = {}
  ) {
    const { idempotencyKey, requestId, ipAddress } = context;

    const result = await withTransaction(async (client) => {
      // Serialize requests by user/key; the retry record commits with the restaurant.
      if (idempotencyKey) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          userId + ':' + idempotencyKey,
        ]);
        const record = await restaurantsRepository.getIdempotencyRecord(
          userId,
          idempotencyKey,
          client
        );
        if (record) {
          if (record.request_hash !== hashPayload(data)) throw new IdempotencyConflictError();
          return { statusCode: record.response_status, body: record.response_body };
        }
      }
      if (await restaurantsRepository.findRestaurantBySlug(data.slug, client))
        throw new ConflictError('Restaurant slug is already in use');
      // 1. Create restaurant
      const restaurant = await restaurantsRepository.createRestaurant(
        {
          name: data.name,
          slug: data.slug,
          category: data.category,
          phone: data.phone,
          email: data.email,
          country: data.country,
          city: data.city,
          address: data.address,
          currency: data.currency,
          timezone: data.timezone,
          status: 'onboarding',
        },
        client
      );

      // 2. Create default branch
      const branch = await restaurantsRepository.createBranch(
        {
          restaurantId: restaurant.id,
          name: data.initial_branch?.name || 'Main Branch',
          slug: 'main',
          isDefault: true,
          phone: data.phone,
          city: data.city,
          address: data.initial_branch?.address || data.address,
        },
        client
      );

      // 3. Create owner membership
      const membership = await restaurantsRepository.createMembership(
        {
          restaurantId: restaurant.id,
          userId,
          status: 'active',
        },
        client
      );

      // 4. Assign Owner role
      const ownerRoleId = await restaurantsRepository.getOwnerRoleId(client);
      if (!ownerRoleId) throw new Error('Required owner role is missing; apply migrations');
      if (ownerRoleId) {
        await restaurantsRepository.assignRoleToMembership(
          {
            membershipId: membership.id,
            roleId: ownerRoleId,
          },
          client
        );
      }

      // 5. Audit event
      await authRepository.createAuditLog(
        {
          actorId: userId,
          restaurantId: restaurant.id,
          action: 'restaurant.created',
          targetType: 'restaurant',
          targetId: restaurant.id,
          metadata: { name: restaurant.name, slug: restaurant.slug },
          requestId,
          ipAddress,
        },
        client
      );

      const body = {
        restaurant,
        defaultBranch: branch,
        membership: {
          id: membership.id,
          status: membership.status,
          role: 'owner',
        },
      };
      const response = { statusCode: 201, body };
      if (idempotencyKey)
        await restaurantsRepository.saveIdempotencyRecord(
          {
            userId,
            key: idempotencyKey,
            requestHash: hashPayload(data),
            responseStatus: 201,
            responseBody: body,
          },
          client
        );
      return response;
    });
    return result;
  }

  async getUserRestaurants(userId: string) {
    return restaurantsRepository.getUserRestaurants(userId);
  }

  async getRestaurantById(tenant: TenantContext) {
    const restaurant = await restaurantsRepository.findRestaurantById(tenant);
    if (!restaurant) {
      throw new NotFoundError('Restaurant not found');
    }
    return restaurant;
  }

  async updateRestaurant(
    tenant: TenantContext,
    updateData: UpdateRestaurantInput,
    context: ServiceContext & { userId: string }
  ) {
    const { userId, requestId, ipAddress } = context;

    const updated = await withTransaction(async (client) => {
      await client.query('SELECT id FROM restaurants WHERE id=$1 FOR UPDATE', [
        tenant.restaurantId,
      ]);
      const rest = await restaurantsRepository.updateRestaurant(tenant, updateData, client);
      const draftRow = (
        await client.query('SELECT content FROM website_drafts WHERE restaurant_id=$1', [
          tenant.restaurantId,
        ])
      ).rows[0];
      if (draftRow) {
        for (const [key, value] of Object.entries(updateData)) {
          if (key in draftRow.content.settings) draftRow.content.settings[key] = value;
        }
        await client.query(
          'UPDATE website_drafts SET content=$2,version=version+1,updated_at=now() WHERE restaurant_id=$1',
          [tenant.restaurantId, draftRow.content]
        );
      }

      await authRepository.createAuditLog(
        {
          actorId: userId,
          restaurantId: tenant.restaurantId,
          action: 'restaurant.updated',
          targetType: 'restaurant',
          targetId: tenant.restaurantId,
          metadata: { updatedFields: Object.keys(updateData) },
          requestId,
          ipAddress,
        },
        client
      );

      return rest;
    });

    return updated;
  }

  async getBranches(tenant: TenantContext) {
    return restaurantsRepository.getBranchesByRestaurantId(tenant);
  }
}

export const restaurantsService = new RestaurantsService();
