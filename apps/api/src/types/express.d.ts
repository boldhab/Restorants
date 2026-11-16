export interface TenantContext {
  restaurantId: string;
  membershipId: string;
  restaurant: { id: string; name: string; slug: string; status: string };
  roles: string[];
  permissions: string[];
}
declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: {
        id: string;
        email: string;
        full_name: string;
        phone?: string;
        is_email_verified: boolean;
        is_platform_admin: boolean;
      };
      session?: { id: string; user_id: string; expires_at: Date };
      tenantContext?: TenantContext;
    }
  }
}
