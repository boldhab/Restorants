export const RestaurantStatus = Object.freeze({
  ONBOARDING: 'onboarding',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
});

export const BranchStatus = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

export const MembershipStatus = Object.freeze({
  ACTIVE: 'active',
  INVITED: 'invited',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
});

export const RoleCode = Object.freeze({
  OWNER: 'owner',
  MANAGER: 'manager',
  STAFF: 'staff',
  KITCHEN: 'kitchen',
  CASHIER: 'cashier',
});

export const PermissionCode = Object.freeze({
  RESTAURANT_READ: 'restaurant:read',
  RESTAURANT_UPDATE: 'restaurant:update',
  RESTAURANT_DELETE: 'restaurant:delete',
  BRANCH_MANAGE: 'branch:manage',
  STAFF_MANAGE: 'staff:manage',
  WORKSPACE_ACCESS: 'workspace:access',
  SETTINGS_UPDATE: 'settings:update',
});

export const ErrorCodes = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  UNVERIFIED_EMAIL: 'UNVERIFIED_EMAIL',
  CSRF_ERROR: 'CSRF_ERROR',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
});
