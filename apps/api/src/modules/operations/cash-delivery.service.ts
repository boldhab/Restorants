import type { PoolClient } from 'pg';
import { ConflictError, ForbiddenError } from '../../shared/errors/app-error.js';
import { event, transition } from '../commerce/commerce.service.js';
import { q } from './operations.repository.js';
import { args, audit, enabled, found, type Context } from './access.service.js';
export async function openCash(c: PoolClient, a: Context, input: any) {
  const { b } = await enabled(c, a, 'cash');
  const register = found((await q(c, 'registers', args(a))).find((r) => r.id === input.registerId));
  if (!register.active) throw new ConflictError('Register disabled');
  return (
    await q(c, 'cashOpen', [
      ...args(a),
      input.registerId,
      a.userId,
      input.opening,
      b.content.settings.currency,
    ])
  )[0];
}
export async function cashAction(c: PoolClient, a: Context, id: string, input: any) {
  const s = found((await q(c, 'cash', [...args(a), id]))[0]);
  if (input.action === 'review') {
    if (!a.permissions.includes('cash_sessions.close')) throw new ForbiddenError();
    return found((await q(c, 'cashReview', [...args(a), id, a.userId]))[0]);
  }
  const previous = input.key ? (await q(c, 'cashPrevious', [...args(a), input.key]))[0] : null;
  if (previous) {
    if (
      previous.cash_session_id !== id ||
      previous.kind !== input.action ||
      previous.order_id !== (input.orderId ?? null) ||
      previous.refund_id !== (input.refundId ?? null) ||
      (input.amount && Number(previous.amount) !== input.amount)
    )
      throw new ConflictError('Cash operation key reused');
    return previous;
  }
  if (s.status === 'CLOSED' && input.action === 'close' && Number(s.counted) === input.counted)
    return s;
  if (s.status !== 'OPEN') throw new ConflictError('Cash session is closed');
  if (input.action === 'close') {
    if (!a.permissions.includes('cash_sessions.close')) throw new ForbiddenError();
    const expected = Number(s.opening) + Number((await q(c, 'cashTotal', [...args(a), id]))[0].n);
    const result = (
      await q(c, 'cashClose', [...args(a), id, input.counted, expected, a.userId])
    )[0];
    await audit(c, a, 'cash', id, 'CLOSED', input.reason, { expected, counted: input.counted });
    return result;
  }
  let amount = input.amount;
  let orderId = input.orderId ?? null;
  if (input.action === 'SALE') {
    if (!a.permissions.includes('payments.collect')) throw new ForbiddenError();
    const o = found((await q(c, 'order', [a.restaurantId, input.orderId]))[0]);
    if (
      o.branch_id !== a.branchId ||
      o.currency !== s.currency ||
      o.method !== 'pay_at_pickup' ||
      o.payment_status === 'PAID' ||
      !['CONFIRMED', 'PREPARING', 'READY'].includes(o.status) ||
      o.snapshot.fulfillment === 'delivery'
    )
      throw new ConflictError('Order not eligible for cash collection');
    amount = Number(o.total);
    if (amount === 0) {
      await q(c, 'paid', [a.restaurantId, o.id, 'zero:' + o.id, 0, o.currency]);
      await q(c, 'paidOrder', [a.restaurantId, o.id]);
      await audit(c, a, 'order', o.id, 'ZERO_BALANCE_SETTLED', input.reason, { cashCollected: 0 });
      return { settled: true, orderId: o.id, cashCollected: 0 };
    }
    await q(c, 'paid', [a.restaurantId, o.id, 'cash:' + o.id, amount, o.currency]);
    await q(c, 'paidOrder', [a.restaurantId, o.id]);
    await event(c, a.restaurantId, 'payment.confirmed', o.id, o.contact, { orderId: o.id });
  } else if (input.action === 'REFUND') {
    if (!a.permissions.includes('refunds.request')) throw new ForbiddenError();
    const r = found((await q(c, 'refund', [a.restaurantId, input.refundId]))[0]);
    const o = found((await q(c, 'order', [a.restaurantId, r.order_id]))[0]);
    if (
      o.branch_id !== a.branchId ||
      o.currency !== s.currency ||
      r.status !== 'PENDING' ||
      !(await q(c, 'cashOrder', [a.restaurantId, o.id])).length
    )
      throw new ConflictError('Only approved cash-origin pending refunds may be disbursed');
    amount = Number(r.amount);
    orderId = null;
    await q(c, 'refundConfirm', [r.id]);
    await event(c, a.restaurantId, 'refund.confirmed', r.id, o.contact, { orderId: o.id });
  } else if (!['IN', 'OUT'].includes(input.action)) throw new ConflictError('Invalid cash action');
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new ConflictError('Positive integer minor-unit amount required');
  const result = (
    await q(c, 'cashMovement', [
      ...args(a),
      id,
      input.action,
      amount,
      orderId,
      input.refundId ?? null,
      input.key,
      a.userId,
      input.reason,
    ])
  )[0];
  await audit(c, a, 'cash', id, input.action, input.reason, { amount });
  return result;
}
export async function assignDelivery(c: PoolClient, a: Context, input: any) {
  const o = found((await q(c, 'order', [a.restaurantId, input.orderId]))[0]);
  if (
    o.branch_id !== a.branchId ||
    o.snapshot.fulfillment !== 'delivery' ||
    o.payment_status !== 'PAID' ||
    !['CONFIRMED', 'PREPARING', 'READY'].includes(o.status)
  )
    throw new ConflictError('Only active prepaid delivery orders may be assigned');
  const rider = (await q(c, 'access', [...args(a), input.riderId]))[0];
  if (!rider?.permissions?.includes('delivery.update_assigned'))
    throw new ForbiddenError('Rider lacks active branch access');
  const old = (await q(c, 'deliveryByOrder', [a.restaurantId, o.id]))[0];
  if (old && ['PICKED_UP', 'EN_ROUTE', 'DELIVERED'].includes(old.state))
    throw new ConflictError('Cannot reassign after handover');
  const d = (await q(c, 'assignment', [...args(a), o.id, input.riderId]))[0];
  await audit(c, a, 'delivery', d.id, old ? 'REASSIGNED' : 'ASSIGNED', input.reason, {
    riderId: input.riderId,
  });
  return d;
}
export async function deliveryAction(c: PoolClient, a: Context, id: string, input: any) {
  const d = found((await q(c, 'deliveryGet', [...args(a), id]))[0]);
  if (d.rider_id !== a.userId || ['FAILED', 'DELIVERED'].includes(d.state))
    throw new ForbiddenError('Assignment no longer accessible');
  if (d.version !== input.version) throw new ConflictError('Delivery changed. Refresh.');
  const next: Record<string, string[]> = {
    ASSIGNED: ['ACCEPTED', 'FAILED'],
    ACCEPTED: ['PICKED_UP', 'FAILED'],
    PICKED_UP: ['EN_ROUTE', 'FAILED'],
    EN_ROUTE: ['DELIVERED', 'FAILED'],
  };
  if (!next[d.state]?.includes(input.state)) throw new ConflictError('Invalid delivery transition');
  if (input.state === 'PICKED_UP' && (d.order_status !== 'READY' || d.payment_status !== 'PAID'))
    throw new ConflictError('Only ready prepaid orders may be handed over');
  if (input.state === 'DELIVERED') {
    const o = (await q(c, 'order', [a.restaurantId, d.order_id]))[0];
    await transition(c, o, 'COMPLETED', a.userId, 'Delivery completed');
  }
  const result = (await q(c, 'deliveryUpdate', [...args(a), id, input.state]))[0];
  await audit(c, a, 'delivery', id, input.state, input.reason);
  await event(
    c,
    a.restaurantId,
    'delivery.' + input.state.toLowerCase(),
    id + ':' + result.version,
    d.contact,
    { orderId: d.order_id }
  );
  return result;
}
