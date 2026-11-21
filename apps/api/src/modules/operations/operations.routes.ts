import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  operationSettingsSchema,
  operationReason as reason,
  operationName as name,
  invitationSchema,
  operationalRoles,
  recipeSchema,
  couponSchema,
} from '@zayqora/contracts';
import { authenticate, requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { withTransaction } from '../../database/transaction.js';
import { ForbiddenError, ConflictError } from '../../shared/errors/app-error.js';
import { q } from './operations.repository.js';
import { hashPayload } from '../../shared/security/tokens.js';
import { safeOrder, business } from '../commerce/commerce.service.js';
import { access, args, audit, enabled, found, type Context } from './access.service.js';
import * as staff from './staff.service.js';
import * as kitchen from './kitchen.service.js';
import * as tables from './tables.service.js';
import * as stock from './inventory.service.js';
import * as cash from './cash-delivery.service.js';
import { lineRefund } from './refunds.service.js';
import * as customers from './customers-reviews.service.js';
import * as exports from './exports.service.js';
import type { PoolClient } from 'pg';
const uuid = (v: unknown) => z.uuid().parse(v),
  version = z.number().int().min(0),
  amount = z.number().int().min(0).max(100000000),
  key = z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/);
const handler =
  (fn: (r: Request, s: Response) => Promise<unknown>): RequestHandler =>
  (r, s, n) => {
    fn(r, s).catch(n);
  };
export const operationalRouter = Router({ mergeParams: true });
operationalRouter.use(authenticate, requireAuth, requireVerifiedEmail);
export const staffInvitationRouter = Router();
staffInvitationRouter.use(authenticate, requireAuth, requireVerifiedEmail);
staffInvitationRouter.post(
  '/accept',
  handler(async (r, s) =>
    s.json(
      await withTransaction((c) =>
        staff.accept(
          c,
          z
            .object({ token: z.string().min(40).max(100) })
            .strict()
            .parse(r.body).token,
          r.user!
        )
      )
    )
  )
);
export const operationalApiDefinitions: Array<{
  method: string;
  path: string;
  permission: string;
  schema?: z.ZodType;
}> = [];
function route(
  method: 'get' | 'post' | 'patch',
  path: string,
  permission: string,
  schema: z.ZodType | undefined,
  fn: (c: PoolClient, a: Context, input: any, r: Request) => Promise<unknown>
) {
  operationalApiDefinitions.push({ method, path, permission, schema });
  operationalRouter[method](
    path,
    handler(async (r, s) => {
      const input = schema ? schema.parse(method === 'get' ? r.query : r.body) : {};
      const data = await withTransaction(async (c) => {
        const id = uuid(r.params.restaurantId);
        const branch =
          typeof r.query.branchId === 'string'
            ? uuid(r.query.branchId)
            : found((await q(c, 'defaultBranch', [id]))[0]).id;
        const a = await access(c, id, branch, r.user!.id, permission);
        if (method === 'get') return fn(c, a, input, r);
        const operationKey = key.parse(r.get('Idempotency-Key'));
        const fingerprint = hashPayload({ path: r.path, input });
        const prior = (await q(c, 'requestGet', [...args(a), a.userId, operationKey]))[0];
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            throw new ConflictError('Idempotency key was used with another action or payload');
          return prior.result;
        }
        const result = await fn(c, a, input, r);
        await q(c, 'requestSave', [...args(a), a.userId, operationKey, fingerprint, result]);
        return result;
      });
      s.json(data);
    })
  );
}
const paging = z.object({
  search: z.string().max(100).default(''),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
route('get', '/context', '', undefined, async (c, a) => {
  const b = await business(c, a.restaurantId);
  const privileged = a.permissions.some((p) =>
    [
      'kitchen.configure',
      'tables.manage',
      'pos.create',
      'inventory.adjust',
      'coupons.manage',
      'cash_sessions.manage',
      'reviews.manage',
      'delivery.assign',
    ].includes(p)
  );
  return {
    ...a,
    settings: (await q(c, 'settingsGet', [a.restaurantId]))[0]?.content ?? null,
    catalog: privileged
      ? {
          items:
            b.content?.items.map((i: any) => ({
              id: i.id,
              name: i.name,
              variants: i.variants,
              modifiers: i.modifiers,
            })) ?? [],
          categories: b.content?.categories ?? [],
          refundItems: a.permissions.includes('refunds.request')
            ? await q(c, 'refundItems', args(a))
            : [],
          pendingRefunds: a.permissions.includes('refunds.request')
            ? await q(c, 'pendingCashRefunds', args(a))
            : [],
          stations: await q(c, 'stations', args(a)),
          roster:
            a.permissions.includes('tables.manage') || a.permissions.includes('delivery.assign')
              ? await q(c, 'roster', args(a))
              : [],
          orders: a.permissions.includes('orders:read') ? await q(c, 'orderOptions', args(a)) : [],
          reservations: a.permissions.includes('tables.manage')
            ? await q(c, 'reservationOptions', args(a))
            : [],
        }
      : null,
  };
});
// Context alone still requires membership; access() treats empty permission as authenticated discovery.
route('get', '/settings', 'operations.configure', undefined, async (c, a) => {
  await q(c, 'settings', [a.restaurantId]);
  return (await q(c, 'settingsGet', [a.restaurantId]))[0];
});
route('patch', '/settings', 'operations.configure', operationSettingsSchema, async (c, a, i) => {
  await enabled(c, a);
  if (i.inventory && !(await q(c, 'locations', args(a))).length)
    throw new ConflictError('Configure a stock location before enabling inventory');
  if (!i.cash && (await q(c, 'cashList', args(a))).some((s) => s.status === 'OPEN'))
    throw new ConflictError('Close every open cash session before disabling cash tracking');
  if (i.cash && !(await q(c, 'registers', args(a))).length)
    throw new ConflictError('Configure a register before enabling cash');
  if (i.tables && !(await q(c, 'tables', args(a))).length)
    throw new ConflictError('Configure tables before enabling service sessions');
  await q(c, 'settings', [a.restaurantId]);
  const result = (await q(c, 'settingsSave', [a.restaurantId, i]))[0];
  await audit(c, a, 'settings', a.restaurantId, 'CHANGED', 'Operational feature settings', i);
  return result;
});
route('get', '/staff', 'staff.manage', undefined, async (c, a) => ({
  members: await q(c, 'staff', [a.restaurantId]),
  invitations: await q(c, 'invites', args(a)),
}));
route('post', '/staff/invitations', 'staff.manage', invitationSchema, staff.invite);
route(
  'post',
  '/staff/invitations/:id/revoke',
  'staff.manage',
  z.object({ reason }).strict(),
  async (c, a, i, r) => {
    const row = found((await q(c, 'inviteRevoke', [...args(a), uuid(r.params.id)]))[0]);
    await audit(c, a, 'invitation', row.id, 'REVOKED', i.reason);
    return { revoked: true };
  }
);
route(
  'post',
  '/staff/invitations/:id/resend',
  'staff.manage',
  z.object({ reason }).strict(),
  async (c, a, i, r) => {
    const row = found((await q(c, 'inviteRevoke', [...args(a), uuid(r.params.id)]))[0]);
    await audit(c, a, 'invitation', row.id, 'RESENT', i.reason);
    return staff.invite(c, a, { email: row.email, role: row.role, branchId: a.branchId });
  }
);
route(
  'patch',
  '/staff/:id',
  'staff.manage',
  z.object({ role: z.enum(operationalRoles), active: z.boolean(), reason }).strict(),
  (c, a, i, r) => staff.changeMember(c, a, uuid(r.params.id), i)
);
route('get', '/kitchen/stations', 'kitchen.read', undefined, (c, a) => q(c, 'stations', args(a)));
route(
  'post',
  '/kitchen/stations',
  'kitchen.configure',
  z.object({ name }).strict(),
  async (c, a, i) => {
    await enabled(c, a);
    return (await q(c, 'station', [...args(a), i.name]))[0];
  }
);
route(
  'post',
  '/kitchen/routing',
  'kitchen.configure',
  z.object({ itemId: z.uuid(), stationIds: z.array(z.uuid()).max(10) }).strict(),
  async (c, a, i) => {
    const { b } = await enabled(c, a);
    if (!b.content.items.some((v: any) => v.id === i.itemId))
      throw new ConflictError('Choose a published item');
    await q(c, 'routeClear', [...args(a), i.itemId]);
    for (const id of i.stationIds) await q(c, 'route', [...args(a), i.itemId, id]);
    return { saved: true };
  }
);
route(
  'post',
  '/kitchen/access',
  'kitchen.configure',
  z.object({ membershipId: z.uuid(), stationId: z.uuid() }).strict(),
  async (c, a, i) => {
    await q(c, 'stationGrant', [...args(a), i.membershipId, i.stationId]);
    return { saved: true };
  }
);
route(
  'get',
  '/kitchen',
  'kitchen.read',
  z.object({ stationId: z.uuid().optional(), offset: z.coerce.number().int().min(0).default(0) }),
  async (c, a, i) => {
    const work = await q(c, 'board', [
      ...args(a),
      i.stationId ?? null,
      a.permissions.includes('kitchen.configure'),
      a.membershipId,
      i.offset,
    ]);
    return {
      stations: await q(c, 'stations', args(a)),
      work: work.slice(0, 300).map(kitchen.safeWork),
      hasMore: work.length > 300,
      offset: i.offset,
      serverTime: new Date().toISOString(),
    };
  }
);
route(
  'post',
  '/kitchen/work/:id',
  'kitchen.update',
  z.object({ version, action: z.enum(['start', 'ready', 'delay', 'reopen']), reason }).strict(),
  (c, a, i, r) => kitchen.workAction(c, a, uuid(r.params.id), i)
);
route('get', '/tables', 'tables.manage', undefined, async (c, a) => ({
  areas: await q(c, 'areas', args(a)),
  tables: await q(c, 'tables', args(a)),
}));
route('post', '/areas', 'tables.manage', z.object({ name }).strict(), async (c, a, i) => {
  await enabled(c, a);
  return (await q(c, 'area', [...args(a), i.name]))[0];
});
route(
  'post',
  '/tables',
  'tables.manage',
  z.object({ areaId: z.uuid(), name, seats: z.number().int().min(1).max(100) }).strict(),
  async (c, a, i) => {
    await enabled(c, a);
    return (await q(c, 'table', [...args(a), i.areaId, i.name, i.seats]))[0];
  }
);
route(
  'patch',
  '/tables/:id',
  'tables.manage',
  z
    .object({
      active: z.boolean(),
      blockedReason: z.string().max(300).nullable(),
      cleaning: z.boolean(),
      reason,
    })
    .strict(),
  async (c, a, i, r) => {
    const id = uuid(r.params.id);
    if ((await q(c, 'visitTable', [...args(a), id])).length)
      throw new ConflictError('Resolve the active visit before blocking or cleaning');
    const t = found(
      (await q(c, 'tableState', [...args(a), id, i.active, i.blockedReason, i.cleaning]))[0]
    );
    await audit(c, a, 'table', id, 'STATE_CHANGED', i.reason);
    return t;
  }
);
route('post', '/tables/:id/qr', 'tables.manage', z.object({}).strict(), (c, a, _i, r) =>
  tables.rotateQR(c, a, uuid(r.params.id))
);
route(
  'post',
  '/visits',
  'tables.manage',
  z
    .object({
      tableId: z.uuid(),
      party: z.number().int().min(1).max(100),
      waiterId: z.uuid().optional(),
      reservationId: z.uuid().optional(),
      expectedEnd: z.iso.datetime({ offset: true }),
    })
    .strict(),
  tables.openVisit
);
route('get', '/visits/:id', 'tables.manage', undefined, async (c, a, _i, r) => {
  const id = uuid(r.params.id);
  const visit = found((await q(c, 'visitGet', [...args(a), id]))[0]);
  return {
    ...visit,
    activation_hash: undefined,
    orders: await q(c, 'visitOrders', [...args(a), id]),
  };
});
route(
  'post',
  '/visits/:id',
  'tables.manage',
  z
    .object({
      version,
      action: z.enum(['close', 'move', 'extend']),
      tableId: z.uuid().optional(),
      expectedEnd: z.iso.datetime({ offset: true }).optional(),
      reason,
    })
    .strict(),
  (c, a, i, r) => tables.updateVisit(c, a, uuid(r.params.id), i)
);
route('get', '/pos/orders/:id', 'pos.create', undefined, async (c, a, _i, r) => {
  const o = found((await q(c, 'order', [a.restaurantId, uuid(r.params.id)]))[0]);
  if (o.branch_id !== a.branchId) throw new ForbiddenError();
  return safeOrder(o);
});
route('get', '/pos/customers', 'pos.create', paging, (c, a, i) =>
  q(c, 'customers', [...args(a), '%' + i.search + '%', i.limit, i.offset])
);
route(
  'post',
  '/refunds/lines',
  'refunds.request',
  z
    .object({
      orderId: z.uuid(),
      lines: z
        .array(
          z.object({ orderItemId: z.uuid(), quantity: z.number().int().min(1).max(20) }).strict()
        )
        .min(1)
        .max(50)
        .refine(
          (v) => new Set(v.map((l) => l.orderItemId)).size === v.length,
          'Each line must appear once'
        ),
      reason,
    })
    .strict(),
  lineRefund
);
route('get', '/cash', 'cash_sessions.manage', undefined, async (c, a) => ({
  registers: await q(c, 'registers', args(a)),
  sessions: await q(c, 'cashList', args(a)),
}));
route(
  'post',
  '/cash/registers',
  'cash_sessions.manage',
  z.object({ name }).strict(),
  async (c, a, i) => {
    await enabled(c, a);
    return (await q(c, 'register', [...args(a), i.name]))[0];
  }
);
route(
  'post',
  '/cash/sessions',
  'cash_sessions.manage',
  z.object({ registerId: z.uuid(), opening: amount }).strict(),
  cash.openCash
);
route('get', '/cash/sessions/:id', 'cash_sessions.manage', undefined, async (c, a, _i, r) => {
  const id = uuid(r.params.id);
  const session = found((await q(c, 'cash', [...args(a), id]))[0]);
  return {
    ...session,
    expectedCurrent:
      Number(session.opening) + Number((await q(c, 'cashTotal', [...args(a), id]))[0].n),
    movements: await q(c, 'cashMovements', [...args(a), id]),
  };
});
route(
  'post',
  '/cash/sessions/:id',
  'cash_sessions.manage',
  z.discriminatedUnion('action', [
    z.object({ action: z.literal('SALE'), key, orderId: z.uuid(), reason }).strict(),
    z.object({ action: z.literal('REFUND'), key, refundId: z.uuid(), reason }).strict(),
    z.object({ action: z.enum(['IN', 'OUT']), key, amount: amount.min(1), reason }).strict(),
    z.object({ action: z.literal('close'), counted: amount, reason }).strict(),
    z.object({ action: z.literal('review'), reason }).strict(),
  ]),
  (c, a, i, r) => cash.cashAction(c, a, uuid(r.params.id), i)
);
route('get', '/delivery', 'delivery.assign', undefined, async (c, a) => ({
  zones: await q(c, 'zones', args(a)),
  assignments: await q(c, 'deliveries', [...args(a), true, a.userId]),
}));
route(
  'post',
  '/delivery/zones',
  'delivery.assign',
  z
    .object({ name, description: z.string().min(3).max(500), fee: amount, active: z.boolean() })
    .strict(),
  async (c, a, i) => {
    await enabled(c, a);
    return (await q(c, 'zone', [...args(a), i.name, i.description, i.fee, i.active]))[0];
  }
);
route(
  'post',
  '/delivery/assign',
  'delivery.assign',
  z.object({ orderId: z.uuid(), riderId: z.uuid(), reason }).strict(),
  cash.assignDelivery
);
route('get', '/deliveries', 'delivery.update_assigned', undefined, (c, a) =>
  q(c, 'deliveries', [...args(a), false, a.userId])
);
route(
  'post',
  '/deliveries/:id',
  'delivery.update_assigned',
  z
    .object({
      version,
      state: z.enum(['ACCEPTED', 'PICKED_UP', 'EN_ROUTE', 'DELIVERED', 'FAILED']),
      reason,
    })
    .strict(),
  (c, a, i, r) => cash.deliveryAction(c, a, uuid(r.params.id), i)
);
route('get', '/inventory', 'inventory.adjust', undefined, async (c, a) => ({
  ingredients: await q(c, 'ingredients', args(a)),
  locations: await q(c, 'locations', args(a)),
  balances: await q(c, 'balances', args(a)),
  movements: await q(c, 'stockLedger', args(a)),
  tracked: await q(c, 'trackingList', args(a)),
  recipes: await q(c, 'recipesList', args(a)),
}));
route(
  'post',
  '/inventory/ingredients',
  'inventory.adjust',
  z
    .object({
      name,
      unit: z.enum(['g', 'ml', 'each']),
      threshold: z.number().int().min(0).max(1000000000),
    })
    .strict(),
  async (c, a, i) => {
    await enabled(c, a);
    return (await q(c, 'ingredient', [...args(a), i.name, i.unit, i.threshold]))[0];
  }
);
route(
  'post',
  '/inventory/locations',
  'inventory.adjust',
  z.object({ name }).strict(),
  async (c, a, i) => {
    await enabled(c, a);
    return (await q(c, 'location', [...args(a), i.name]))[0];
  }
);
route(
  'post',
  '/inventory/movements',
  'inventory.adjust',
  z
    .object({
      ingredientId: z.uuid(),
      locationId: z.uuid(),
      unit: z.enum(['g', 'kg', 'ml', 'l', 'each']),
      quantity: z.number().int().min(-1000000000).max(1000000000),
      kind: z.enum(['OPENING', 'RECEIPT', 'ADJUSTMENT', 'WASTE']),
      reason,
      key,
    })
    .strict(),
  stock.adjustStock
);
route(
  'post',
  '/inventory/tracking',
  'inventory.adjust',
  z.object({ itemId: z.uuid() }).strict(),
  async (c, a, i) => {
    const { b } = await enabled(c, a, 'inventory');
    if (!b.content.items.some((v: any) => v.id === i.itemId))
      throw new ConflictError('Choose a published item');
    await q(c, 'track', [...args(a), i.itemId]);
    return { tracked: true };
  }
);
route(
  'post',
  '/inventory/prepared-waste',
  'inventory.adjust',
  z
    .object({
      reservationId: z.uuid(),
      quantity: z.number().int().min(1).max(1000000000),
      key,
      reason,
    })
    .strict(),
  stock.preparedWaste
);
route(
  'post',
  '/inventory/recipes',
  'inventory.adjust',
  recipeSchema.extend({ locationId: z.uuid() }),
  stock.saveRecipe
);
route('get', '/coupons', 'coupons.manage', undefined, (c, a) => q(c, 'coupons', args(a)));
route('post', '/coupons', 'coupons.manage', couponSchema, async (c, a, i) => {
  await enabled(c, a, 'coupons');
  const row = (await q(c, 'coupon', [...args(a), i.code, i]))[0];
  await audit(c, a, 'coupon', row.id, 'SAVED', 'Coupon rules updated');
  return row;
});
route('get', '/customers', 'customers.read', paging, (c, a, i) =>
  q(c, 'customers', [...args(a), '%' + i.search + '%', i.limit, i.offset])
);
route('get', '/customers/:id', 'customers.read', undefined, (c, a, _i, r) =>
  customers.customerDetail(c, a, uuid(r.params.id))
);
route(
  'post',
  '/customers/:id/notes',
  'customers.notes',
  z.object({ note: z.string().trim().min(1).max(2000) }).strict(),
  async (c, a, i, r) => {
    await customers.customerDetail(c, a, uuid(r.params.id));
    return (await q(c, 'note', [...args(a), uuid(r.params.id), i.note, a.userId]))[0];
  }
);
route('get', '/reviews', 'reviews.manage', undefined, (c, a) => q(c, 'reviews', args(a)));
route(
  'post',
  '/reviews/invitations',
  'reviews.manage',
  z.object({ orderId: z.uuid() }).strict(),
  (c, a, i) => customers.inviteReview(c, a, i.orderId)
);
route(
  'post',
  '/reviews/:id',
  'reviews.manage',
  z
    .object({
      status: z.enum(['PUBLISHED', 'HIDDEN']).optional(),
      response: z.string().max(2000).optional(),
      category: z.enum(['spam', 'abuse', 'privacy']).optional(),
      reason,
    })
    .strict(),
  (c, a, i, r) => customers.moderateReview(c, a, uuid(r.params.id), i)
);
const reportFilters = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(
    (i) => i.from <= i.to && Date.parse(i.to) - Date.parse(i.from) <= 366 * 86400000,
    'Choose a date range within one year'
  );
const kinds = z.enum([
  'orders',
  'collections',
  'refunds',
  'cash',
  'inventory',
  'customers',
  'coupons',
  'delivery',
]);
route(
  'get',
  '/reports',
  'exports.generate',
  reportFilters.and(z.object({ kind: kinds })),
  (c, a, i) => exports.report(c, a, i.kind, i)
);
route('get', '/exports', 'exports.generate', undefined, (c, a) => q(c, 'exports', args(a)));
route(
  'post',
  '/exports',
  'exports.generate',
  reportFilters.and(z.object({ kind: kinds, format: z.enum(['csv', 'pdf']) })),
  async (c, a, i) => {
    if (i.kind === 'customers' && !a.permissions.includes('customers.export'))
      throw new ForbiddenError();
    const r = (
      await q(c, 'export', [...args(a), a.userId, i.kind, i.format, { from: i.from, to: i.to }])
    )[0];
    await audit(c, a, 'export', r.id, 'REQUESTED', 'Private export requested');
    return r;
  }
);
operationalRouter.get(
  '/exports/:id/download',
  handler(async (r, s) => {
    const job = await withTransaction(async (c) => {
      const id = uuid(r.params.restaurantId);
      const branch =
        typeof r.query.branchId === 'string'
          ? uuid(r.query.branchId)
          : found((await q(c, 'defaultBranch', [id]))[0]).id;
      const a = await access(c, id, branch, r.user!.id, 'exports.generate');
      const j = found((await q(c, 'exportGet', [id, branch, uuid(r.params.id)]))[0]);
      if (j.kind === 'customers' && !a.permissions.includes('customers.export'))
        throw new ForbiddenError();
      if (j.state !== 'DONE' || !j.bytes || new Date(j.expires_at) <= new Date())
        throw new ConflictError('Export pending, failed or expired');
      await audit(c, a, 'export', j.id, 'DOWNLOADED', 'Private export download');
      return j;
    });
    s.setHeader(
      'Content-Disposition',
      `attachment; filename="zayqora-${job.kind}-${job.id}.${job.format}"`
    );
    s.setHeader(
      'Content-Type',
      job.format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8'
    );
    s.setHeader('X-Content-Type-Options', 'nosniff');
    s.send(job.bytes);
  })
);
