import type { PoolClient } from 'pg';
import { ConflictError, ForbiddenError } from '../../shared/errors/app-error.js';
import { q } from './operations.repository.js';
import { args, audit, enabled, found, type Context } from './access.service.js';
import { reserveIngredients, resolveIngredients } from './inventory.service.js';
import { transition } from '../commerce/commerce.service.js';

export function preparationSnapshot(s: any) {
  return {
    id: s.id,
    itemId: s.itemId,
    name: s.name,
    quantity: s.quantity,
    variantId: s.variantId,
    options: s.options,
    variant: s.variant ? { id: s.variant.id, name: s.variant.name } : null,
    modifiers: s.modifiers?.map((m: any) => ({ id: m.id, name: m.name, group: m.group })),
    allergens: s.allergens,
  };
}
export function safeWork(w: any) {
  return { ...w, snapshot: preparationSnapshot(w.snapshot) };
}

export async function orderEffect(c: PoolClient, o: any, status: string, reason: string) {
  const settings = (await q(c, 'settingsGet', [o.restaurant_id]))[0]?.content;
  if (status === 'CONFIRMED') {
    if (!(await q(c, 'acceptanceEffect', [o.restaurant_id, o.branch_id, o.id])).length) return;
    if (settings?.kitchen || settings?.inventory)
      await enabled(c, { restaurantId: o.restaurant_id, branchId: o.branch_id });
    if (settings?.inventory) await reserveIngredients(c, o);
    if (settings?.kitchen) {
      const ticket = (await q(c, 'ticket', [o.restaurant_id, o.branch_id, o.id]))[0];
      if (ticket) {
        const fallback = (await q(c, 'fallback', [o.restaurant_id, o.branch_id]))[0];
        for (const item of await q(c, 'items', [o.restaurant_id, o.id])) {
          const routes = await q(c, 'routes', [o.restaurant_id, o.branch_id, item.snapshot.itemId]);
          for (const r of routes.length ? routes : [{ station_id: fallback.id }])
            await q(c, 'work', [
              o.restaurant_id,
              o.branch_id,
              ticket.id,
              item.id,
              r.station_id,
              preparationSnapshot(item.snapshot),
            ]);
        }
      }
    }
    await q(c, 'couponState', [o.restaurant_id, o.id, 'REDEEMED']);
  }
  if (status === 'PREPARING') await resolveIngredients(c, o, true);
  const ticket = (await q(c, 'ticketGet', [o.restaurant_id, o.id]))[0];
  if (status === 'READY' && ticket && (await q(c, 'unfinished', [ticket.id])).length)
    throw new ConflictError('All required station work must be ready');
  if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(status)) {
    await resolveIngredients(c, o, false);
    for (const delivery of await q(c, 'cancelDelivery', [o.restaurant_id, o.id]))
      await q(c, 'audit', [
        o.restaurant_id,
        o.branch_id,
        'delivery',
        delivery.id,
        'FAILED',
        null,
        'Order ' + status.toLowerCase() + ': ' + reason,
        {},
      ]);
    await q(c, 'couponState', [o.restaurant_id, o.id, 'RELEASED']);
    if (ticket) {
      await q(c, 'cancelWork', [o.restaurant_id, ticket.id, reason]);
      await q(c, 'ticketState', [o.restaurant_id, ticket.id, 'CANCELLED']);
    }
  }
}
export async function workAction(
  c: PoolClient,
  a: Context,
  id: string,
  input: { version: number; action: string; reason: string }
) {
  const w = found((await q(c, 'workGet', [...args(a), id]))[0]);
  if (
    !a.permissions.includes('kitchen.configure') &&
    !(await q(c, 'stationAllowed', [...args(a), a.membershipId, w.station_id])).length
  )
    throw new ForbiddenError('Station access denied');
  if (w.version !== input.version) throw new ConflictError('Kitchen work changed. Reload.');
  const o = found((await q(c, 'order', [a.restaurantId, w.order_id]))[0]);
  if (['CANCELLED', 'EXPIRED', 'REJECTED', 'COMPLETED'].includes(o.status))
    throw new ConflictError('Order is no longer active');
  let state = w.state;
  if (input.action === 'start' && state === 'WAITING') state = 'PREPARING';
  else if (input.action === 'ready' && state === 'PREPARING') state = 'READY';
  else if (input.action === 'reopen' && state === 'READY') {
    if (!a.permissions.includes('kitchen.correct'))
      throw new ForbiddenError('Correction permission required');
    state = 'PREPARING';
    if (o.status === 'READY') {
      // Explicit correction is exceptional and audited; never alters financial snapshots.
      await q(c, 'reopenOrder', [a.restaurantId, o.id]);
    }
  } else if (input.action !== 'delay') throw new ConflictError('Invalid work transition');
  if (input.action === 'start' && o.status === 'CONFIRMED')
    await transition(c, o, 'PREPARING', a.userId, input.reason);
  const result = (
    await q(c, 'workUpdate', [
      ...args(a),
      id,
      state,
      input.action === 'delay' ? input.reason : null,
    ])
  )[0];
  if (!(await q(c, 'unfinished', [w.ticket_id])).length) {
    await q(c, 'ticketState', [a.restaurantId, w.ticket_id, 'READY']);
    const current = (await q(c, 'order', [a.restaurantId, o.id]))[0];
    if (current.status === 'PREPARING')
      await transition(c, current, 'READY', a.userId, 'All required station work ready');
  } else await q(c, 'ticketState', [a.restaurantId, w.ticket_id, 'PREPARING']);
  await audit(c, a, 'kitchen', id, input.action, input.reason, { from: w.state, to: state });
  return safeWork(result);
}
