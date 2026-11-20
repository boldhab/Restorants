import { env } from '../../config/env.js';
import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { hashToken } from '../../shared/security/tokens.js';
import { ConflictError, ForbiddenError } from '../../shared/errors/app-error.js';
import { event, type Scope } from '../commerce/commerce.service.js';
import { q } from './operations.repository.js';
import { args, audit, found, type Context } from './access.service.js';
export async function customerDetail(c: PoolClient, a: Context, id: string) {
  const orders = await q(c, 'customerOrders', [...args(a), id]);
  const reservations = await q(c, 'customerReservations', [...args(a), id]);
  if (!orders.length && !reservations.length)
    throw new ForbiddenError('Customer not found in this branch');
  const summary: Record<string, { completedSales: number; collected: number; refunds: number }> =
    {};
  // Independent aggregates avoid joins multiplying collections or sales.
  const totals = await q(c, 'customerTotals', [...args(a), id]);
  for (const t of totals)
    summary[t.currency] = {
      completedSales: Number(t.sales),
      collected: Number(t.collected),
      refunds: Number(t.refunds),
    };
  return {
    orders,
    reservations,
    summary,
    notes: a.permissions.includes('customers.notes')
      ? await q(c, 'notes', [...args(a), id])
      : undefined,
  };
}
export async function inviteReview(c: PoolClient, a: Context, id: string) {
  const o = found((await q(c, 'order', [a.restaurantId, id]))[0]);
  if (o.branch_id !== a.branchId || o.status !== 'COMPLETED')
    throw new ConflictError('Complete the order first');
  const token = randomBytes(32).toString('base64url');
  await q(c, 'reviewInvite', [...args(a), id, hashToken(token)]);
  await event(
    c,
    a.restaurantId,
    'review.invitation',
    id + ':' + hashToken(token).slice(0, 8),
    o.contact,
    { reviewUrl: `${env.APP_URL}/review/${a.restaurantId}/${id}#review=${token}`, orderId: id }
  );
  await audit(c, a, 'review', id, 'INVITED', 'Review invitation issued');
  return { invited: true };
}
export async function submitReview(c: PoolClient, scope: Scope, id: string, input: any) {
  await q(c, 'lock', [scope.restaurantId]);
  const o = found((await q(c, 'order', [scope.restaurantId, id]))[0]);
  if (o.status !== 'COMPLETED') throw new ConflictError('Only completed orders are eligible');
  const owner = o.user_id ? o.user_id === scope.userId : o.session_id === scope.sessionId;
  let invitation: any;
  if (input.token)
    invitation = (await q(c, 'reviewToken', [scope.restaurantId, id, hashToken(input.token)]))[0];
  // Guest possession alone is insufficient: guest reviews require an emailed single-use invitation.
  if (!(o.user_id && owner) && !invitation)
    throw new ForbiddenError(
      'Authenticated order ownership or a valid single-use review invitation required'
    );
  const r = (
    await q(c, 'review', [
      scope.restaurantId,
      o.branch_id,
      id,
      scope.userId ?? null,
      input.rating,
      input.comment,
    ])
  )[0];
  if (!r) throw new ConflictError('This order already has a review');
  if (invitation) await q(c, 'reviewConsume', [invitation.id]);
  return { id: r.id, rating: r.rating, comment: r.comment };
}
export async function moderateReview(c: PoolClient, a: Context, id: string, input: any) {
  const r = found((await q(c, 'reviewGet', [...args(a), id]))[0]);
  if (input.status === 'HIDDEN' && !['spam', 'abuse', 'privacy'].includes(input.category))
    throw new ConflictError('A transparent spam, abuse or privacy reason is required');
  const result = (
    await q(c, 'moderate', [...args(a), id, input.status ?? r.status, input.response ?? r.response])
  )[0];
  await audit(c, a, 'review', id, input.status ? 'MODERATED' : 'RESPONDED', input.reason, {
    category: input.category,
    previous: r.status,
    status: result.status,
  });
  return result;
}
