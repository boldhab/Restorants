import { ForbiddenError } from '../shared/errors/app-error.js';

/**
 * Middleware that checks if the resolved tenant context includes a specific permission code.
 * Restaurant owners automatically bypass role-permission checks for their tenant.
 */
export function authorize(requiredPermission: string) {
  return (
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) => {
    if (!req.tenantContext) {
      return next(new ForbiddenError('Tenant context missing'));
    }

    const { permissions } = req.tenantContext;

    if (requiredPermission && !permissions.includes(requiredPermission)) {
      return next(new ForbiddenError(`Missing required permission: ${requiredPermission}`));
    }

    next();
  };
}

/**
 * Middleware requiring platform administrator privileges
 */
export function requirePlatformAdmin(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  if (!req.user || !req.user.is_platform_admin) {
    return next(new ForbiddenError('Platform administrator privileges required'));
  }
  next();
}
