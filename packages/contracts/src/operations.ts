import { z } from 'zod';
export const operationalRoles = [
  'owner',
  'manager',
  'cashier',
  'chef',
  'waiter',
  'rider',
  'accountant',
] as const;
export const operationalPermissions = [
  'staff.manage',
  'kitchen.configure',
  'kitchen.read',
  'kitchen.update',
  'kitchen.correct',
  'tables.manage',
  'pos.create',
  'cash_sessions.manage',
  'cash_sessions.close',
  'payments.collect',
  'refunds.request',
  'delivery.assign',
  'delivery.update_assigned',
  'inventory.adjust',
  'coupons.manage',
  'customers.read',
  'customers.notes',
  'customers.export',
  'reviews.manage',
  'exports.generate',
  'operations.configure',
] as const;
export const operationSettingsSchema = z
  .object({
    kitchen: z.boolean(),
    tables: z.boolean(),
    pos: z.boolean(),
    cash: z.boolean(),
    delivery: z.boolean(),
    inventory: z.boolean(),
    coupons: z.boolean(),
  })
  .strict();
export const operationDefaults = {
  kitchen: false,
  tables: false,
  pos: false,
  cash: false,
  delivery: false,
  inventory: false,
  coupons: false,
};
export const operationReason = z.string().trim().min(3).max(500);
export const operationName = z.string().trim().min(1).max(100);
export const operationalOrderContext = z
  .object({
    channel: z.enum(['online', 'pos', 'qr']).default('online'),
    mode: z.enum(['pickup', 'dine_in', 'delivery']).default('pickup'),
    serviceSessionId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    zoneId: z.uuid().optional(),
    address: z.string().trim().min(5).max(500).optional(),
    instructions: z.string().max(500).default(''),
    preparationNotes: z.string().max(500).default(''),
    allergyNotes: z.string().max(500).default(''),
    coupon: z.string().trim().max(40).optional(),
  })
  .strict();
export const invitationSchema = z
  .object({ email: z.email().max(255), role: z.enum(operationalRoles), branchId: z.uuid() })
  .strict();
export const recipeSchema = z
  .object({
    itemId: z.uuid(),
    variantId: z.uuid().nullable().default(null),
    optionId: z.uuid().nullable().default(null),
    components: z
      .array(
        z
          .object({ ingredientId: z.uuid(), quantity: z.number().int().min(1).max(1000000000) })
          .strict()
      )
      .min(1)
      .max(100),
  })
  .strict();
export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,40}$/),
    kind: z.enum(['percent', 'fixed', 'free_delivery']),
    value: z.number().int().min(0).max(100000000),
    minimum: z.number().int().min(0),
    maximum: z.number().int().min(0),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    limit: z.number().int().min(1).max(1000000),
    perCustomer: z.number().int().min(0).max(1000),
    itemIds: z.array(z.uuid()).max(100),
    categoryIds: z.array(z.uuid()).max(100),
    modes: z.array(z.enum(['pickup', 'dine_in', 'delivery'])).min(1),
    active: z.boolean(),
  })
  .strict()
  .refine((v) => Date.parse(v.startsAt) < Date.parse(v.endsAt), 'End must follow start')
  .refine((v) => v.kind !== 'percent' || v.value <= 10000, 'Percentage uses basis points');
export const operationalRolePermissions: Record<string, string[]> = {
  owner: [...operationalPermissions],
  manager: [...operationalPermissions],
  cashier: [
    'pos.create',
    'cash_sessions.manage',
    'cash_sessions.close',
    'payments.collect',
    'orders:read',
    'workspace:access',
    'restaurant:read',
  ],
  chef: ['kitchen.read', 'kitchen.update', 'workspace:access', 'restaurant:read'],
  waiter: ['tables.manage', 'pos.create', 'orders:read', 'workspace:access', 'restaurant:read'],
  rider: ['delivery.update_assigned', 'workspace:access', 'restaurant:read'],
  accountant: [
    'exports.generate',
    'customers.export',
    'reports:read',
    'workspace:access',
    'restaurant:read',
  ],
};
