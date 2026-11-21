import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { hashToken } from '../../shared/security/tokens.js';
import { ConflictError, ForbiddenError } from '../../shared/errors/app-error.js';
import { q } from './operations.repository.js';
import { args, audit, enabled, found, type Context } from './access.service.js';
export function capacityCheck(
  rows: any[],
  start: Date,
  end: Date,
  party: number,
  capacity: number
) {
  const points = rows
    .filter((r) => new Date(r.start_at) < end && new Date(r.end_at) > start)
    .flatMap((r) => [
      { t: Math.max(start.getTime(), new Date(r.start_at).getTime()), n: Number(r.covers) },
      { t: Math.min(end.getTime(), new Date(r.end_at).getTime()), n: -Number(r.covers) },
    ])
    .sort((a, b) => a.t - b.t || a.n - b.n);
  let n = party;
  if (n > capacity) throw new ConflictError('Branch cover capacity exceeded');
  for (const p of points) {
    n += p.n;
    if (n > capacity)
      throw new ConflictError('Overlapping reservations and visits exceed cover capacity');
  }
}
export async function openVisit(c: PoolClient, a: Context, input: any) {
  const { b } = await enabled(c, a, 'tables');
  const t = found((await q(c, 'tableGet', [...args(a), input.tableId]))[0]);
  if (
    !t.active ||
    t.cleaning ||
    t.blocked_reason ||
    (await q(c, 'visitTable', [...args(a), t.id])).length
  )
    throw new ConflictError('Table unavailable');
  if (input.party > t.seats) throw new ConflictError('Party exceeds table seats');
  let reservation: any = null;
  if (input.reservationId) {
    reservation = found((await q(c, 'reservation', [...args(a), input.reservationId]))[0]);
    if (
      reservation.status !== 'CONFIRMED' ||
      reservation.party !== input.party ||
      Date.now() < new Date(reservation.start_at).getTime() - 900000 ||
      Date.now() > new Date(reservation.end_at).getTime()
    )
      throw new ConflictError('Reservation not eligible for seating');
  }
  if (input.waiterId && !(await q(c, 'memberUser', [...args(a), input.waiterId])).length)
    throw new ForbiddenError('Waiter has no active branch membership');
  const end = new Date(input.expectedEnd);
  if (end <= new Date() || end.getTime() > Date.now() + 12 * 3600000)
    throw new ConflictError('Expected departure must be within twelve hours');
  capacityCheck(
    await q(c, 'commitments', [...args(a), input.reservationId ?? null, null]),
    new Date(),
    end,
    input.party,
    b.settings.capacity
  );
  const activation = randomBytes(12).toString('base64url');
  const s = (
    await q(c, 'visit', [
      ...args(a),
      t.id,
      input.party,
      input.waiterId ?? null,
      input.reservationId ?? null,
      end,
      hashToken(activation),
    ])
  )[0];
  if (reservation) {
    await q(c, 'seatReservation', [reservation.id]);
    await q(c, 'reservationRelease', [a.restaurantId, reservation.id]);
  }
  await audit(c, a, 'visit', s.id, 'OPENED', 'Guest seated', {
    reservationId: input.reservationId,
  });
  return { ...s, activation, activation_hash: undefined };
}
export async function updateVisit(c: PoolClient, a: Context, id: string, input: any) {
  const s = found((await q(c, 'visitGet', [...args(a), id]))[0]);
  if (s.status !== 'OPEN' || s.version !== input.version)
    throw new ConflictError('Service session changed or closed');
  if (input.action === 'close') {
    const orders = await q(c, 'visitOrders', [...args(a), id]);
    for (const o of orders)
      if (
        !['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(o.status) ||
        (!['CANCELLED', 'REJECTED', 'EXPIRED'].includes(o.status) && o.payment_status !== 'PAID') ||
        (await q(c, 'pendingRefund', [a.restaurantId, o.id])).length
      )
        throw new ConflictError('Resolve open orders, balances and refunds before closure');
    await q(c, 'visitClose', [...args(a), id]);
    await q(c, 'cleaning', [s.table_id]);
    if (s.reservation_id) await q(c, 'completeReservation', [s.reservation_id]);
  } else {
    const { b } = await enabled(c, a, 'tables');
    const t = found((await q(c, 'tableGet', [...args(a), input.tableId ?? s.table_id]))[0]);
    const occupied = (await q(c, 'visitTable', [...args(a), t.id]))[0];
    if (
      !t.active ||
      t.cleaning ||
      t.blocked_reason ||
      t.seats < s.party ||
      (occupied && occupied.id !== id)
    )
      throw new ConflictError('Destination table unavailable');
    const end = new Date(input.expectedEnd ?? s.expected_end);
    if (end <= new Date() || end.getTime() > Date.now() + 12 * 3600000)
      throw new ConflictError('Invalid expected departure');
    capacityCheck(
      await q(c, 'commitments', [...args(a), s.reservation_id, id]),
      new Date(),
      end,
      s.party,
      b.settings.capacity
    );
    await q(c, 'visitMove', [...args(a), id, t.id, end]);
    if (t.id !== s.table_id) await q(c, 'cleaning', [s.table_id]);
  }
  await audit(c, a, 'visit', id, input.action, input.reason);
  return { updated: true };
}
export async function rotateQR(c: PoolClient, a: Context, id: string) {
  await enabled(c, a, 'tables');
  found((await q(c, 'tableGet', [...args(a), id]))[0]);
  const token = randomBytes(32).toString('base64url');
  await q(c, 'qrRotate', [...args(a), id, hashToken(token)]);
  await audit(c, a, 'table', id, 'QR_ROTATED', 'Printed reference rotated');
  return { reference: token, path: `/table/${a.restaurantId}#${token}` };
}
export async function joinTable(
  c: PoolClient,
  restaurantId: string,
  commerceSessionId: string,
  reference: string,
  activation: string
) {
  await q(c, 'lock', [restaurantId]);
  const t = found((await q(c, 'qrResolve', [hashToken(reference)]))[0]);
  if (t.restaurant_id !== restaurantId || !t.active || t.blocked_reason || t.cleaning)
    throw new ForbiddenError('Table reference unavailable');
  await enabled(c, { restaurantId, branchId: t.branch_id }, 'tables');
  const s = found((await q(c, 'visitTable', [restaurantId, t.branch_id, t.id]))[0]);
  if (hashToken(activation) !== s.activation_hash)
    throw new ForbiddenError('Ask your waiter for the current visit activation code');
  const token = randomBytes(32).toString('base64url');
  await q(c, 'guestGrant', [restaurantId, t.branch_id, s.id, commerceSessionId, hashToken(token)]);
  return { token, sessionId: s.id, tableName: t.name, branchId: t.branch_id };
}
