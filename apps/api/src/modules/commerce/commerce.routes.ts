import { joinTable } from '../operations/tables.service.js';
import {submitReview} from '../operations/customers-reviews.service.js';
import {q as opQuery} from '../operations/operations.repository.js';
import {withTransaction} from '../../database/transaction.js';
import { commerceRepository as repo } from './commerce.repository.js';
import { Router, raw, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  cartLineSchema,
  commerceSettingsSchema,
  submitOrderSchema,
  reservationRequestSchema,
  orderStates,
  reservationStates,
} from '@zayqora/contracts';
import { authenticate, requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { authorize, requirePlatformAdmin } from '../../middleware/authorize.js';
import { resolveTenant } from '../../middleware/resolve-tenant.js';
import { validate } from '../../middleware/validate.js';
import { generalLimiter } from '../../middleware/rate-limit.js';
import { env } from '../../config/env.js';
import { pool } from '../../database/pool.js';
import { ForbiddenError, ValidationError } from '../../shared/errors/app-error.js';
import { guestSession, scopes } from './guest-session.js';
import * as core from './commerce.service.js';
import * as bookings from './reservations.service.js';
import * as manage from './management.service.js';
import * as payments from './payments.service.js';
const h =
  (
    fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<unknown>
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const uuid = (v: unknown) => z.uuid().parse(v),
  reason = z.string().trim().min(3).max(500),
  version = z.number().int().min(0);
const pagination = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(orderStates).optional(),
  payment: z.enum(['UNPAID', 'PENDING', 'UNKNOWN', 'PAID', 'FAILED']).optional(),
  reference: z
    .string()
    .regex(/^[A-Z0-9-]{1,20}$/)
    .optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export const customerCommerceRouter = Router({ mergeParams: true });
customerCommerceRouter.use(generalLimiter, authenticate, guestSession);
customerCommerceRouter.get(
  '/session',
  h(async (req, res) =>
    res.json({
      csrf: res.locals.guestCsrf,
      ...(await core.publicSettings(scopes.get(req)!.restaurantId)),
    })
  )
);
customerCommerceRouter.get(
  '/cart',
  h(async (req, res) => res.json(await core.getCart(scopes.get(req)!)))
);
customerCommerceRouter.patch(
  '/cart',
  validate(
    z
      .object({
        version,
        line: cartLineSchema.optional(),
        removeId: z.uuid().optional(),
        clear: z.boolean().optional(),
      })
      .strict()
      .refine(
        (v) => [!!v.line, !!v.removeId, !!v.clear].filter(Boolean).length === 1,
        'Choose one cart operation'
      )
  ),
  h(async (req, res) =>
    res.json(
      await core.mutateCart(
        scopes.get(req)!,
        req.body.version,
        req.body.line,
        req.body.removeId,
        req.body.clear
      )
    )
  )
);
customerCommerceRouter.post('/context',h(async(req,res)=>res.json(await core.setOrderContext(scopes.get(req)!,req.body))));
customerCommerceRouter.post('/table/join',h(async(req,res)=>{
 const input=z.object({reference:z.string().min(40).max(100),activation:z.string().min(12).max(100)}).strict().parse(req.body);const scope=scopes.get(req)!;
 const joined=await withTransaction(c=>joinTable(c,scope.restaurantId,scope.sessionId,input.reference,input.activation));
 res.cookie('zq_table_'+scope.restaurantId.replaceAll('-',''),joined.token,{signed:true,httpOnly:true,secure:env.COOKIE_SECURE,sameSite:'lax',path:'/api/v1/commerce/'+scope.restaurantId,maxAge:12*3600000});res.json({...joined,token:undefined});
}));
customerCommerceRouter.get('/reviews',h(async(req,res)=>{const id=scopes.get(req)!.restaurantId;res.json({reviews:await opQuery(pool,'publicReviews',[id]),aggregate:(await opQuery(pool,'reviewAggregate',[id]))[0]});}));
customerCommerceRouter.post('/orders/:orderId/review',h(async(req,res)=>{const input=z.object({rating:z.number().int().min(1).max(5),comment:z.string().trim().min(3).max(2000),token:z.string().min(40).max(100).optional()}).strict().parse(req.body);res.json(await withTransaction(c=>submitReview(c,scopes.get(req)!,uuid(req.params.orderId),input)));}));
customerCommerceRouter.post('/reviews/:id/report',requireAuth,h(async(req,res)=>{const input=z.object({reason}).strict().parse(req.body);const id=uuid(req.params.id);const scope=scopes.get(req)!;await withTransaction(async c=>{const rows=await opQuery(c,'publicReviewGet',[scope.restaurantId,id]);if(!rows[0])throw new ValidationError('Review unavailable');await opQuery(c,'reviewReport',[scope.restaurantId,rows[0].branch_id,id,req.user!.id,input.reason]);});res.json({reported:true});}));
customerCommerceRouter.post(
  '/quotes',
  h(async (req, res) => res.status(201).json(await core.createQuote(scopes.get(req)!)))
);
customerCommerceRouter.post(
  '/orders',
  validate(submitOrderSchema),
  h(async (req, res) => {
    if (req.user && !req.user.is_email_verified)
      throw new ForbiddenError('Verify your account before checkout');
    const key = z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,128}$/)
      .safeParse(req.get('Idempotency-Key'));
    if (!key.success) throw new ValidationError('Provide an Idempotency-Key');
    res.status(201).json(await core.submitOrder(scopes.get(req)!, key.data, req.body, env.IS_TEST));
  })
);
customerCommerceRouter.get(
  '/orders',
  h(async (req, res) => {
    const s = scopes.get(req)!;
    const rows = (
      await repo.execute(pool, 'selectOrders', [s.restaurantId, s.userId ?? null, s.sessionId])
    ).rows;
    res.json(rows.map(core.safeOrder));
  })
);
customerCommerceRouter.get(
  '/orders/:orderId',
  h(async (req, res) =>
    res.json(await core.customerOrder(scopes.get(req)!, uuid(req.params.orderId)))
  )
);
customerCommerceRouter.post(
  '/orders/:orderId/cancellation',
  h(async (req, res) =>
    res.json(await core.cancelCustomer(scopes.get(req)!, uuid(req.params.orderId)))
  )
);
customerCommerceRouter.post(
  '/orders/:orderId/payment',
  h(async (req, res) => {
    const o = await core.customerOrder(scopes.get(req)!, uuid(req.params.orderId));
    if (o.method !== 'test_online' || !env.IS_TEST)
      throw new ValidationError('Online payment is not configured');
    await repo.execute(pool, 'updatePaymentAttempts', [scopes.get(req)!.restaurantId, o.id]);
    res.json({
      pending: true,
      message: 'Payment outcome is reconciled by the worker using the same provider identity.',
    });
  })
);
customerCommerceRouter.get(
  '/reservations/availability',
  h(async (req, res) => {
    const q = z
      .object({ date: z.iso.date(), party: z.coerce.number().int().min(1).max(100) })
      .parse(req.query);
    res.json(await bookings.slots(scopes.get(req)!.restaurantId, q.date, q.party));
  })
);
customerCommerceRouter.post(
  '/reservations',
  validate(reservationRequestSchema),
  h(async (req, res) =>
    res.status(201).json(await bookings.requestReservation(scopes.get(req)!, req.body))
  )
);
customerCommerceRouter.get(
  '/reservations',
  h(async (req, res) => res.json(await bookings.customerReservations(scopes.get(req)!)))
);
const reservationUpdate = z
  .object({
    version,
    status: z.enum(reservationStates).optional(),
    start: z.iso.datetime({ offset: true }).optional(),
    reason,
  })
  .strict()
  .refine((v) => !!v.status !== !!v.start, 'Choose a status or reschedule time');
customerCommerceRouter.patch(
  '/reservations/:reservationId',
  validate(reservationUpdate),
  h(async (req, res) => {
    const s = scopes.get(req)!;
    res.json(
      await bookings.updateReservation(
        s.restaurantId,
        uuid(req.params.reservationId),
        req.body,
        s.userId ?? null,
        s
      )
    );
  })
);
customerCommerceRouter.get(
  '/profile',
  requireAuth,
  requireVerifiedEmail,
  h(async (req, res) => res.json(await manage.profile(scopes.get(req)!.restaurantId, req.user!.id)))
);
customerCommerceRouter.patch(
  '/profile',
  requireAuth,
  requireVerifiedEmail,
  validate(
    z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: z.string().max(30),
        transactionalEmail: z.boolean(),
        marketingConsent: z.boolean(),
        addresses: z
          .array(
            z
              .object({ label: z.string().min(1).max(50), address: z.string().min(1).max(255) })
              .strict()
          )
          .max(10),
      })
      .strict()
  ),
  h(async (req, res) =>
    res.json(await manage.profile(scopes.get(req)!.restaurantId, req.user!.id, req.body))
  )
);
customerCommerceRouter.get(
  '/notifications',
  h(async (req, res) => {
    const s = scopes.get(req)!;
    res.json(
      (
        await repo.execute(pool, 'selectInAppNotifications', [
          s.restaurantId,
          s.userId ?? null,
          s.sessionId,
        ])
      ).rows
    );
  })
);
export const operationsRouter = Router({ mergeParams: true });
operationsRouter.use(
  generalLimiter,
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  resolveTenant('restaurantId', true)
);
const tenant = (req: Parameters<RequestHandler>[0]) => req.tenantContext!.restaurantId;
operationsRouter.get(
  '/settings',
  authorize('restaurant:update'),
  h(async (req, res) => res.json(await manage.readSettings(tenant(req))))
);
operationsRouter.patch(
  '/settings',
  authorize('restaurant:update'),
  validate(z.object({ version, settings: commerceSettingsSchema }).strict()),
  h(async (req, res) =>
    res.json(
      await manage.saveSettings(tenant(req), req.body.version, req.body.settings, req.user!.id)
    )
  )
);
operationsRouter.get(
  '/orders',
  authorize('orders:read'),
  h(async (req, res) => res.json(await manage.orders(tenant(req), pagination.parse(req.query))))
);
operationsRouter.get(
  '/orders/:orderId',
  authorize('orders:read'),
  h(async (req, res) => res.json(await manage.staffOrder(tenant(req), uuid(req.params.orderId))))
);
operationsRouter.patch(
  '/orders/:orderId',
  authorize('orders:process'),
  validate(
    z
      .object({
        version,
        status: z.enum(orderStates),
        reason,
        preparationMinutes: z.number().int().min(0).max(180).optional(),
      })
      .strict()
  ),
  (req, res, next) =>
    ['CANCELLED', 'REJECTED'].includes(req.body.status)
      ? authorize('orders:cancel')(req, res, next)
      : next(),
  h(async (req, res) =>
    res.json(
      await core.staffTransition(
        tenant(req),
        uuid(req.params.orderId),
        req.body.version,
        req.body.status,
        req.user!.id,
        req.body.reason,
        req.body.preparationMinutes
      )
    )
  )
);
operationsRouter.post(
  '/orders/:orderId/collection',
  authorize('payments:manage'),
  validate(z.object({ version }).strict()),
  h(async (req, res) =>
    res.json(
      await core.collect(tenant(req), uuid(req.params.orderId), req.body.version, req.user!.id)
    )
  )
);
operationsRouter.post(
  '/orders/:orderId/refunds',
  authorize('payments:manage'),
  validate(z.object({ amount: z.number().int().min(1).max(100000000), reason }).strict()),
  h(async (req, res) =>
    res
      .status(201)
      .json(
        await core.requestRefund(
          tenant(req),
          uuid(req.params.orderId),
          req.body.amount,
          req.user!.id,
          req.body.reason
        )
      )
  )
);
operationsRouter.post(
  '/refunds/:refundId/confirmation',
  authorize('payments:manage'),
  h(async (req, res) =>
    res.json(await core.confirmPickupRefund(tenant(req), uuid(req.params.refundId), req.user!.id))
  )
);
operationsRouter.get(
  '/reservations',
  authorize('reservations:manage'),
  h(async (req, res) =>
    res.json(await manage.reservations(tenant(req), pagination.parse(req.query).offset))
  )
);
operationsRouter.patch(
  '/reservations/:reservationId',
  authorize('reservations:manage'),
  validate(reservationUpdate),
  h(async (req, res) =>
    res.json(
      await bookings.updateReservation(
        tenant(req),
        uuid(req.params.reservationId),
        req.body,
        req.user!.id
      )
    )
  )
);
operationsRouter.get(
  '/reports',
  authorize('reports:read'),
  h(async (req, res) => {
    const q = z
      .object({ from: z.iso.date(), to: z.iso.date() })
      .refine(
        (v) =>
          v.from <= v.to && new Date(v.to).getTime() - new Date(v.from).getTime() <= 366 * 86400000,
        'Use an ordered range within one year'
      )
      .parse(req.query);
    res.json(await manage.reports(tenant(req), q.from, q.to));
  })
);
operationsRouter.get(
  '/notifications/jobs',
  authorize('restaurant:update'),
  h(async (req, res) =>
    res.json((await repo.execute(pool, 'selectOutboxEvents', [tenant(req)])).rows)
  )
);
operationsRouter.post(
  '/notifications/jobs/:jobId/retry',
  authorize('restaurant:update'),
  h(async (req, res) =>
    res.json({
      retried: !!(
        await repo.execute(pool, 'updateOutboxEvents', [tenant(req), uuid(req.params.jobId)])
      ).rowCount,
    })
  )
);
export const platformRouter = Router();
platformRouter.use(
  generalLimiter,
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  requirePlatformAdmin
);
platformRouter.get(
  '/tenants',
  h(async (req, res) => res.json(await manage.platformTenants(pagination.parse(req.query).offset)))
);
platformRouter.get(
  '/plans',
  h(async (_req, res) => res.json((await repo.execute(pool, 'selectPlans')).rows))
);
platformRouter.get(
  '/tenants/:restaurantId',
  h(async (req, res) => {
    const id = uuid(req.params.restaurantId);
    res.json({
      settings: await manage.readSettings(id),
      audit: (await repo.execute(pool, 'selectAuditLogs', [id])).rows,
    });
  })
);
platformRouter.patch(
  '/tenants/:restaurantId',
  validate(
    z
      .object({
        status: z.enum(['active', 'suspended', 'onboarding']).optional(),
        plan: z.enum(['basic', 'pilot']).optional(),
        subscriptionStatus: z.enum(['manual', 'trial', 'inactive']).optional(),
        trialEndsAt: z.iso.datetime({ offset: true }).optional(),
        reason,
      })
      .strict()
      .refine((v) => !!v.status || !!v.plan, 'Choose a status or plan')
      .refine(
        (v) => v.subscriptionStatus !== 'trial' || !!v.trialEndsAt,
        'Trial expiry is required'
      )
  ),
  h(async (req, res) =>
    res.json(await manage.platformChange(uuid(req.params.restaurantId), req.body, req.user!.id))
  )
);
export const accountRouter = Router();
accountRouter.use(authenticate, requireAuth, requireVerifiedEmail);
accountRouter.get(
  '/history',
  h(async (req, res) => res.json(await manage.accountHistory(req.user!.id)))
);
export const testPaymentWebhook = [
  raw({ type: 'application/json', limit: '128kb' }),
  h(async (req, res) => {
    payments.verifyTestSignature(
      req.body,
      req.get('X-Test-Signature') ?? '',
      req.get('X-Test-Timestamp') ?? ''
    );
    let input;
    try {
      input = z
        .object({
          eventId: z.string().min(1).max(200),
          reference: z.string().min(1).max(200),
          merchant: z.uuid(),
          amount: z.number().int().min(0),
          currency: z.string().length(3),
          status: z.enum(['PENDING', 'PAID', 'FAILED']),
        })
        .strict()
        .parse(JSON.parse(req.body.toString()));
    } catch {
      throw new ValidationError('Invalid payment callback');
    }
    res.json(await payments.applyPayment(input));
  }),
];

platformRouter.get(
  '/operations/health',
  h(async (_req, res) => res.json(await manage.operationsHealth()))
);

operationsRouter.post(
  '/orders/:orderId/cancellation-resolution',
  authorize('orders:cancel'),
  validate(z.object({ version, decision: z.enum(['approve', 'decline']), reason }).strict()),
  h(async (req, res) =>
    res.json(
      await core.resolveCancellation(
        tenant(req),
        uuid(req.params.orderId),
        req.body.version,
        req.body.decision,
        req.user!.id,
        req.body.reason
      )
    )
  )
);
