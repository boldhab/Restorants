import { access as operationalAccess } from '../operations/access.service.js';
import { q as opQuery } from '../operations/operations.repository.js';
import { validateOrderContext } from '../operations/order-context.service.js';
import { operationalPricing, reserveCoupon } from '../operations/pricing.service.js';
import { orderEffect } from '../operations/kitchen.service.js';
import { commerceRepository as repo } from './commerce.repository.js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  defaultCommerceSettings,
  configurationPrice,
  isOpen,
  orderTransitions,
  type CommerceSettings,
  type Draft,
  type CartLine,
} from '@zayqora/contracts';
import { pool } from '../../database/pool.js';
import { withTransaction } from '../../database/transaction.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error.js';
import { hashPayload } from '../../shared/security/tokens.js';
export type Scope = {
  restaurantId: string;
  sessionId: string;
  userId?: string;
  tableToken?: string;
};
export async function business(c: PoolClient, id: string, feature?: 'ordering' | 'reservations') {
  const r = (await repo.execute(c, 'selectRestaurants', [id])).rows[0];
  if (!r) throw new NotFoundError('Restaurant not found');
  await repo.execute(c, 'insertCommerceSettings', [id, defaultCommerceSettings]);
  const settings = (await repo.execute(c, 'selectCommerceSettings', [id])).rows[0];
  r.settings = settings.content as CommerceSettings;
  r.settingsVersion = settings.version;
  if (
    feature &&
    (!['active', 'onboarding'].includes(r.status) ||
      r.branch_status !== 'active' ||
      !r.revision ||
      !r[feature] ||
      !r.settings[feature === 'ordering' ? 'enabled' : 'reservations'])
  )
    throw new ForbiddenError('This restaurant is not accepting new ' + feature);
  return r as typeof r & { settings: CommerceSettings; content: Draft };
}
export async function event(
  c: PoolClient,
  restaurantId: string,
  kind: string,
  id: string,
  contact: any,
  payload: Record<string, unknown> = {}
) {
  if (!payload.sessionId && payload.orderId) {
    const owner = (await repo.execute(c, 'selectOrders2', [restaurantId, payload.orderId])).rows[0];
    if (owner) payload = { ...payload, sessionId: owner.session_id, userId: owner.user_id };
  }
  if (!payload.sessionId && payload.reservationId) {
    const owner = (
      await repo.execute(c, 'selectReservations', [restaurantId, payload.reservationId])
    ).rows[0];
    if (owner) payload = { ...payload, sessionId: owner.session_id, userId: owner.user_id };
  }

  await repo.execute(c, 'insertOutboxEvents', [
    restaurantId,
    `${kind}:${id}`,
    kind,
    { ...payload, contact },
  ]);
}
export async function cart(c: PoolClient, scope: Scope, b: any, create = true) {
  const row = (
    await repo.execute(c, 'selectCarts', [
      scope.restaurantId,
      scope.userId ?? null,
      scope.sessionId,
    ])
  ).rows[0];
  if (row || !create) return row;
  return (
    await repo.execute(c, 'insertCarts', [
      scope.restaurantId,
      b.branch_id,
      scope.sessionId,
      scope.userId ?? null,
    ])
  ).rows[0];
}
function priceLine(
  line: CartLine,
  b: any,
  availability: any[],
  now = new Date(),
  mode = 'takeaway'
) {
  const item = (b.content as Draft).items.find((i) => i.id === line.itemId);
  if (!item) throw new ValidationError('This item is no longer on the published menu');
  const a = availability.find((a) => a.item_id === item.id)?.content;
  if (
    a &&
    (a.soldOut ||
      !a.enabled ||
      !a.serviceModes.includes(mode as any) ||
      (a.hours && !isOpen(a.hours, b.content.settings.timezone, now)))
  )
    throw new ValidationError(`${item.name} is unavailable for pickup`);
  if (!b.content.settings.serviceModes.includes(mode as any))
    throw new ValidationError('Pickup is not enabled on the published menu');
  let unit: number;
  try {
    unit = configurationPrice(item, line.variantId, line.options);
  } catch (e) {
    throw new ValidationError((e as Error).message);
  }
  return {
    currency: b.content.settings.currency,
    id: line.id ?? randomUUID(),
    itemId: item.id,
    name: item.name,
    allergens: item.allergens,
    revision: b.revision,
    variant: item.variants.find((v) => v.id === line.variantId) ?? null,
    modifiers: item.modifiers.flatMap((g) =>
      g.options.filter((o) => line.options.includes(o.id)).map((o) => ({ group: g.name, ...o }))
    ),
    variantId: line.variantId,
    options: line.options,
    quantity: line.quantity,
    unit,
    lineTotal: unit * line.quantity,
  };
}
async function availability(c: PoolClient, id: string) {
  return (await repo.execute(c, 'selectItemAvailability', [id])).rows;
}
export async function publicSettings(id: string) {
  return withTransaction(async (c) => {
    const b = await business(c, id);
    return {
      restaurantId: id,
      slug: b.slug,
      name: b.content?.settings.name ?? 'Restaurant',
      timezone: b.content?.settings.timezone ?? 'UTC',
      ordering:
        !!b.ordering &&
        b.settings.enabled &&
        ['active', 'onboarding'].includes(b.status) &&
        !!b.revision,
      reservations:
        !!b.reservations &&
        b.settings.reservations &&
        ['active', 'onboarding'].includes(b.status) &&
        !!b.revision,
      payAtPickup: b.settings.payAtPickup,
      leadMinutes: b.settings.leadMinutes,
      minimum: b.settings.minimum,
      onlinePayment: false,
    };
  });
}
export async function getCart(scope: Scope) {
  return withTransaction(async (c) => {
    const b = await business(c, scope.restaurantId),
      row = await cart(c, scope, b),
      a = await availability(c, scope.restaurantId);
    return {
      ...row,
      issues: row.lines.flatMap((l: any) => {
        try {
          const p = priceLine(
            l,
            b,
            a,
            new Date(),
            row.operational_context?.mode === 'dine_in'
              ? 'dine_in'
              : row.operational_context?.mode === 'delivery'
                ? 'delivery'
                : 'takeaway'
          );
          return l.revision !== b.revision || l.unit !== p.unit
            ? [{ id: l.id, message: 'Menu changed. Refresh your checkout quote.' }]
            : [];
        } catch (e) {
          return [{ id: l.id, message: (e as Error).message }];
        }
      }),
    };
  });
}
export async function mutateCart(
  scope: Scope,
  version: number,
  line?: CartLine,
  removeId?: string,
  clear = false
) {
  return withTransaction(async (c) => {
    const b = await business(c, scope.restaurantId, 'ordering'),
      row = await cart(c, scope, b);
    if (row.version !== version) throw new ConflictError('Cart changed. Reload it.');
    let lines = row.lines as any[];
    if (clear) lines = [];
    else if (removeId) lines = lines.filter((l) => l.id !== removeId);
    else if (line) {
      const ctx = await validateOrderContext(c, scope, b, row.operational_context);
      const p = priceLine(
        line,
        b,
        await availability(c, scope.restaurantId),
        new Date(),
        ctx.mode === 'pickup' ? 'takeaway' : ctx.mode === 'dine_in' ? 'dine_in' : 'delivery'
      );
      if (line.id && !lines.some((l) => l.id === line.id))
        throw new NotFoundError('Cart item not found');
      lines = line.id ? lines.map((l) => (l.id === line.id ? p : l)) : [...lines, p];
    }
    if (lines.length > 50) throw new ValidationError('Maximum 50 cart lines');
    return (await repo.execute(c, 'updateCarts', [row.id, JSON.stringify(lines)])).rows[0];
  });
}
async function quoteFor(c: PoolClient, scope: Scope, row: any, b: any) {
  if (!row?.lines.length) throw new ValidationError('Your cart is empty');
  const now = new Date();
  if (
    !isOpen(b.content.settings.hours, b.content.settings.timezone, now) ||
    !isOpen(
      b.content.settings.hours,
      b.content.settings.timezone,
      new Date(now.getTime() + b.settings.leadMinutes * 60000)
    )
  )
    throw new ConflictError('Restaurant is closed or too close to closing for immediate pickup');
  const context = await validateOrderContext(c, scope, b, row.operational_context);
  const a = await availability(c, scope.restaurantId),
    lines = row.lines.map((l: CartLine) =>
      priceLine(
        l,
        b,
        a,
        now,
        context.mode === 'pickup' ? 'takeaway' : context.mode === 'dine_in' ? 'dine_in' : 'delivery'
      )
    );
  const amounts = await operationalPricing(c, b, scope, lines, context);
  if (amounts.subtotal < b.settings.minimum)
    throw new ValidationError('Cart is below the minimum order amount');
  const content = {
    ...context,
    ...amounts,
    lines,
    currency: b.content.settings.currency,
    fulfillment: context.mode,
    restaurantName: b.content.settings.name,
    pickupAddress: b.content.settings.address,
    pickupPhone: b.content.settings.phone,
    leadMinutes: b.settings.leadMinutes,
    taxBps: b.settings.taxBps,
    warnings: row.lines.some((l: any) => l.revision !== b.revision)
      ? ['The menu changed. Review and confirm this quote.']
      : [],
  };
  return (
    await repo.execute(c, 'insertCheckoutQuotes', [
      scope.restaurantId,
      row.id,
      scope.sessionId,
      scope.userId ?? null,
      row.version,
      b.settingsVersion,
      b.revision,
      content,
    ])
  ).rows[0];
}
export async function createQuote(scope: Scope) {
  return withTransaction(async (c) => {
    const b = await business(c, scope.restaurantId, 'ordering');
    return quoteFor(c, scope, await cart(c, scope, b), b);
  });
}
export async function submitOrder(scope: Scope, key: string, input: any, test = false) {
  const result = await withTransaction(async (c) => {
    const b = await business(c, scope.restaurantId);
    const owner = scope.userId ? 'user:' + scope.userId : 'guest:' + scope.sessionId;
    const operation = `order:${owner}`;
    await repo.execute(c, 'selectWork', [scope.restaurantId + operation + key]);
    const previous = (
      await repo.execute(c, 'selectCheckoutOperations', [scope.restaurantId, operation, key])
    ).rows[0];
    if (previous) {
      if (previous.fingerprint !== hashPayload(input))
        throw new ConflictError('Idempotency key was used with another payload');
      const original = (await opQuery(c, 'order', [scope.restaurantId, previous.result.id]))[0];
      if (original?.snapshot.channel === 'pos') {
        if (!scope.userId) throw new ForbiddenError('Staff access required');
        await operationalAccess(
          c,
          scope.restaurantId,
          original.branch_id,
          scope.userId,
          'pos.create'
        );
      }
      return previous.result;
    }
    // Re-read under the same restaurant lock; the durable retry path works even when suspended.
    await business(c, scope.restaurantId, 'ordering');
    const q = (
      await repo.execute(c, 'selectCheckoutQuotes', [
        scope.restaurantId,
        input.quoteId,
        scope.userId ?? null,
        scope.sessionId,
      ])
    ).rows[0];
    if (!q) throw new NotFoundError('Quote not found');
    const row = await cart(c, scope, b, false);
    if (!row || row.id !== q.cart_id) throw new ConflictError('Cart already submitted or changed');
    if (
      new Date(q.expires_at) < new Date() ||
      q.cart_version !== row.version ||
      q.settings_version !== b.settingsVersion ||
      q.revision_id !== b.revision
    )
      return { conflict: true, quote: await quoteFor(c, scope, row, b) };
    const check = await quoteFor(c, scope, row, b);
    if (hashPayload(check.content) !== hashPayload(q.content))
      return { conflict: true, quote: check };
    if (q.content.fulfillment === 'delivery' && input.method === 'pay_at_pickup')
      throw new ValidationError(
        'Delivery requires a configured prepaid provider; cash on delivery is disabled'
      );
    if (input.method === 'pay_at_pickup' && !b.settings.payAtPickup)
      throw new ValidationError('Pay at pickup is disabled');
    if (input.method === 'test_online' && !test)
      throw new ValidationError('No online payment provider is configured');
    const order = (
      await repo.execute(c, 'insertOrders', [
        scope.restaurantId,
        b.branch_id,
        row.id,
        q.id,
        scope.sessionId,
        q.content.channel === 'pos' ? (q.content.customerId ?? null) : (scope.userId ?? null),
        'ZQ-' + randomUUID().slice(0, 8).toUpperCase(),
        input.method === 'pay_at_pickup' ? 'UNPAID' : 'PENDING',
        input.method,
        q.content.currency,
        q.content.total,
        q.content,
        input.contact,
        b.settings.leadMinutes,
      ])
    ).rows[0];
    await reserveCoupon(c, order);
    if (q.content.serviceSessionId)
      await opQuery(c, 'sessionOrder', [
        scope.restaurantId,
        b.branch_id,
        q.content.serviceSessionId,
        order.id,
      ]);
    for (const line of q.content.lines)
      await repo.execute(c, 'insertOrderItems', [scope.restaurantId, order.id, line]);
    await repo.execute(c, 'updateCarts2', [row.id, scope.userId ?? null]);
    await repo.execute(c, 'insertOrderHistory', [
      scope.restaurantId,
      order.id,
      scope.userId ?? null,
    ]);
    if (input.method === 'test_online')
      await repo.execute(c, 'insertPaymentAttempts', [scope.restaurantId, order.id, randomUUID()]);
    await event(c, scope.restaurantId, 'order.created', order.id, input.contact, {
      orderId: order.id,
      sessionId: scope.sessionId,
      userId: scope.userId,
    });
    if (q.content.channel === 'pos')
      await transition(c, order, 'CONFIRMED', scope.userId ?? null, 'POS submission accepted');
    const response = {
      id: order.id,
      reference: order.reference,
      status: q.content.channel === 'pos' ? 'CONFIRMED' : order.status,
      paymentStatus: order.payment_status,
    };
    await repo.execute(c, 'insertCheckoutOperations', [
      scope.restaurantId,
      scope.sessionId,
      operation,
      key,
      hashPayload(input),
      response,
    ]);
    return response;
  });
  if (result.conflict)
    throw new AppError(
      'Quote expired or changed. Review and confirm the updated quote.',
      409,
      'QUOTE_CHANGED',
      { quote: result.quote }
    );
  return result;
}
export function safeOrder(o: any) {
  return {
    id: o.id,
    restaurantId: o.restaurant_id,
    reference: o.reference,
    status: o.status,
    paymentStatus: o.payment_status,
    method: o.method,
    currency: o.currency,
    total: Number(o.total),
    snapshot: o.snapshot,
    contact: o.contact,
    version: o.version,
    cancellationRequested: o.cancellation_requested,
    createdAt: o.created_at,
    completedAt: o.completed_at,
    preparationMinutes: o.preparation_minutes,
  };
}
export async function customerOrder(scope: Scope, id: string) {
  const o = (
    await repo.execute(pool, 'selectOrders3', [
      scope.restaurantId,
      id,
      scope.userId ?? null,
      scope.sessionId,
    ])
  ).rows[0];
  if (!o) throw new NotFoundError('Order not found');
  return {
    ...safeOrder(o),
    delivery: (await opQuery(pool, 'deliverySafe', [scope.restaurantId, id]))[0] ?? null,
    history: (await repo.execute(pool, 'selectOrderHistory', [scope.restaurantId, id])).rows,
    refunds: (await repo.execute(pool, 'selectRefundRequests', [scope.restaurantId, id])).rows,
  };
}
export async function transition(
  c: PoolClient,
  o: any,
  status: string,
  actorId: string | null,
  reason: string
) {
  if (status === 'PREPARING' && o.cancellation_requested)
    throw new ConflictError('Resolve the customer cancellation request before preparation');
  if (!orderTransitions[o.status]?.includes(status))
    throw new ConflictError(`Cannot move ${o.status} to ${status}`);
  if (
    ['CONFIRMED', 'PREPARING'].includes(status) &&
    o.method !== 'pay_at_pickup' &&
    o.payment_status !== 'PAID'
  )
    throw new ConflictError('Online payment must settle before acceptance/preparation');
  if (
    status === 'COMPLETED' &&
    (o.payment_status !== 'PAID' ||
      (await repo.execute(c, 'selectRefundRequests2', [o.restaurant_id, o.id])).rowCount)
  )
    throw new ConflictError('Resolve payment and refunds before completion');
  await orderEffect(c, o, status, reason);
  const updated = (await repo.execute(c, 'updateOrders', [o.restaurant_id, o.id, status])).rows[0];
  await repo.execute(c, 'insertOrderHistory2', [o.restaurant_id, o.id, status, actorId, reason]);
  await event(c, o.restaurant_id, 'order.' + status.toLowerCase(), o.id, o.contact, {
    orderId: o.id,
    sessionId: o.session_id,
    userId: o.user_id,
  });
  if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(status) && o.payment_status === 'PAID') {
    const reserved = Number(
      (await repo.execute(c, 'selectRefundRequests3', [o.restaurant_id, o.id])).rows[0].n
    );
    if (Number(o.total) > reserved)
      await reserveRefund(
        c,
        o.restaurant_id,
        o.id,
        Number(o.total) - reserved,
        actorId,
        'Order ' + status.toLowerCase()
      );
  }
  return safeOrder(updated);
}
export async function staffTransition(
  id: string,
  orderId: string,
  version: number,
  status: string,
  actorId: string,
  reason: string,
  preparationMinutes?: number
) {
  return withTransaction(async (c) => {
    await business(c, id);
    const o = (await repo.execute(c, 'selectOrders4', [id, orderId])).rows[0];
    if (!o) throw new NotFoundError('Order not found');
    if (o.version !== version) throw new ConflictError('Order changed. Refresh.');
    if (
      o.status === 'PENDING' &&
      new Date(o.expires_at) <= new Date() &&
      ['CONFIRMED', 'PREPARING'].includes(status)
    )
      throw new ConflictError('Order acceptance window expired');
    if (preparationMinutes !== undefined)
      await repo.execute(c, 'updateOrders2', [id, orderId, preparationMinutes]);
    return transition(c, o, status, actorId, reason);
  });
}
export async function cancelCustomer(scope: Scope, id: string) {
  return withTransaction(async (c) => {
    await business(c, scope.restaurantId);
    const o = (
      await repo.execute(c, 'selectOrders5', [
        scope.restaurantId,
        id,
        scope.userId ?? null,
        scope.sessionId,
      ])
    ).rows[0];
    if (!o) throw new NotFoundError('Order not found');
    if (o.status === 'PENDING')
      return transition(c, o, 'CANCELLED', scope.userId ?? null, 'Customer cancellation');
    if (o.status !== 'CONFIRMED') throw new ConflictError('Cancellation is no longer available');
    if (o.cancellation_requested) return { requested: true };
    await repo.execute(c, 'insertOrderHistory2', [
      scope.restaurantId,
      id,
      'CANCELLATION_REQUESTED',
      scope.userId ?? null,
      'Customer requested cancellation',
    ]);
    await repo.execute(c, 'updateOrders3', [id]);
    await event(c, scope.restaurantId, 'order.cancellation_requested', id, o.contact, {
      orderId: id,
    });
    return { requested: true };
  });
}
export async function collect(id: string, orderId: string, version: number, actor: string) {
  return withTransaction(async (c) => {
    await business(c, id);
    const o = (await repo.execute(c, 'selectOrders4', [id, orderId])).rows[0];
    if (!o) throw new NotFoundError('Order not found');
    if (o.version !== version) throw new ConflictError('Order changed');
    if (
      o.method !== 'pay_at_pickup' ||
      o.payment_status === 'PAID' ||
      !['CONFIRMED', 'PREPARING', 'READY'].includes(o.status)
    )
      throw new ConflictError('Collection is not permitted');
    if ((await opQuery(c, 'settingsGet', [id]))[0]?.content.cash)
      throw new ConflictError('Use an open cash session to record cash collection');
    await repo.execute(c, 'insertPaymentTransactions', [
      id,
      orderId,
      'pickup:' + orderId,
      o.total,
      o.currency,
    ]);
    await repo.execute(c, 'updateOrders4', [orderId]);
    await repo.execute(c, 'insertAuditLogs', [actor, id, orderId, { amount: o.total }]);
    await event(c, id, 'payment.confirmed', orderId, o.contact, {
      orderId,
      sessionId: o.session_id,
      userId: o.user_id,
    });
    return { collected: true };
  });
}
export async function reserveRefund(
  c: PoolClient,
  id: string,
  orderId: string,
  amount: number,
  actor: string | null,
  reason: string
) {
  const o = (await repo.execute(c, 'selectOrders4', [id, orderId])).rows[0];
  if (!o) throw new NotFoundError('Order not found');
  const paid = Number(
    (await repo.execute(c, 'selectPaymentTransactions', [id, orderId])).rows[0].n
  );
  const reserved = Number(
    (await repo.execute(c, 'selectRefundRequests3', [id, orderId])).rows[0].n
  );
  if (amount <= 0 || amount > paid - reserved)
    throw new ConflictError('Refund exceeds the remaining collected amount');
  const r = (await repo.execute(c, 'insertRefundRequests', [id, orderId, amount, reason, actor]))
    .rows[0];
  await repo.execute(c, 'insertAuditLogs2', [actor, id, r.id, { amount, reason }]);
  await event(c, id, 'refund.requested', r.id, o.contact, { orderId });
  return r;
}
export async function requestRefund(
  id: string,
  orderId: string,
  amount: number,
  actor: string,
  reason: string
) {
  return withTransaction(async (c) => {
    await business(c, id);
    return reserveRefund(c, id, orderId, amount, actor, reason);
  });
}
export async function confirmPickupRefund(id: string, refundId: string, actor: string) {
  return withTransaction(async (c) => {
    await business(c, id);
    const r = (await repo.execute(c, 'selectRefundRequests4', [id, refundId])).rows[0];
    if (!r) throw new NotFoundError('Refund not found');
    if (r.method !== 'pay_at_pickup' || r.status !== 'PENDING')
      throw new ConflictError('Only pending pickup refunds can be recorded manually');
    if ((await opQuery(c, 'cashOrder', [id, r.order_id])).length)
      throw new ConflictError('Disburse this refund through an open cash session');
    await repo.execute(c, 'updateRefundRequests', [refundId]);
    await repo.execute(c, 'insertAuditLogs3', [actor, id, refundId]);
    await event(c, id, 'refund.confirmed', refundId, r.contact, { orderId: r.order_id });
    return { confirmed: true };
  });
}

export async function resolveCancellation(
  id: string,
  orderId: string,
  version: number,
  decision: 'approve' | 'decline',
  actor: string,
  reason: string
) {
  return withTransaction(async (c) => {
    await business(c, id);
    const o = (await repo.execute(c, 'selectOrders4', [id, orderId])).rows[0];
    if (!o) throw new NotFoundError('Order not found');
    if (o.version !== version) throw new ConflictError('Order changed. Refresh.');
    if (o.status !== 'CONFIRMED' || !o.cancellation_requested)
      throw new ConflictError('No eligible cancellation request');
    if (decision === 'approve') return transition(c, o, 'CANCELLED', actor, reason);
    await repo.execute(c, 'cancellationReview', [id, orderId]);
    await repo.execute(c, 'insertOrderHistory2', [
      id,
      orderId,
      'CANCELLATION_DECLINED',
      actor,
      reason,
    ]);
    await event(c, id, 'order.cancellation_declined', orderId, o.contact, { orderId });
    return { declined: true };
  });
}

export async function setOrderContext(scope: Scope, input: unknown) {
  return withTransaction(async (c) => {
    const b = await business(c, scope.restaurantId, 'ordering');
    const row = await cart(c, scope, b);
    const context = await validateOrderContext(c, scope, b, input);
    return (await opQuery(c, 'contextSave', [row.id, context]))[0];
  });
}
