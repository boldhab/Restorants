import { pool } from '../database/pool.js';
import { ForbiddenError, NotFoundError } from '../shared/errors/app-error.js';

export function resolveTenant(paramName = 'restaurantId') {
  return async (
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) => {
    try {
      if (!req.user) {
        return next(new ForbiddenError('Authentication required to access restaurant resources'));
      }

      const restaurantId = req.params[paramName];
      if (!restaurantId || typeof restaurantId !== 'string') {
        return next(new NotFoundError('Restaurant not found'));
      }

      // Check active membership and collect roles and permissions
      const query = `
        SELECT 
          m.id AS membership_id,
          m.status AS membership_status,
          r.id AS restaurant_id,
          r.name AS restaurant_name,
          r.slug AS restaurant_slug,
          r.status AS restaurant_status,
          COALESCE(ARRAY_AGG(DISTINCT ro.name) FILTER (WHERE ro.name IS NOT NULL), '{}') AS roles,
          COALESCE(ARRAY_AGG(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
        FROM restaurant_memberships m
        INNER JOIN restaurants r ON m.restaurant_id = r.id
        LEFT JOIN membership_roles mr ON m.id = mr.membership_id
        LEFT JOIN roles ro ON mr.role_id = ro.id
        LEFT JOIN role_permissions rp ON ro.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE m.restaurant_id = $1 AND m.user_id = $2
        GROUP BY m.id, r.id
      `;

      const result = await pool.query(query, [restaurantId, req.user.id]);

      if (result.rows.length === 0) {
        // Return 404/403 without disclosing restaurant existence
        return next(new ForbiddenError('You do not have access to this restaurant'));
      }

      const row = result.rows[0];

      if (row.membership_status !== 'active') {
        return next(
          new ForbiddenError('Your membership in this restaurant is inactive or revoked')
        );
      }

      if (!['onboarding', 'active'].includes(row.restaurant_status))
        return next(new ForbiddenError('Restaurant is unavailable'));

      req.tenantContext = {
        restaurantId: row.restaurant_id,
        membershipId: row.membership_id,
        restaurant: {
          id: row.restaurant_id,
          name: row.restaurant_name,
          slug: row.restaurant_slug,
          status: row.restaurant_status,
        },
        roles: row.roles,
        permissions: row.permissions,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
