import {q as opQuery} from '../operations/operations.repository.js';
import { commerceRepository as repo } from './commerce.repository.js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { isOpen } from '@zayqora/contracts';
import { withTransaction } from '../../database/transaction.js';
import { pool } from '../../database/pool.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import { business, event, type Scope } from './commerce.service.js';
export function localParts(date: Date, zone: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => p.find((p) => p.type === t)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}
async function check(
  c: PoolClient,
  b: any,
  start: Date,
  party: number,
  exclude?: string,
  confirmationEnd?: Date
) {
  const s = b.settings,
    now = Date.now(),
    end =
      confirmationEnd ?? new Date(start.getTime() + (s.durationMinutes + s.bufferMinutes) * 60000);
  if (
    !Number.isFinite(start.getTime()) ||
    (!confirmationEnd && party > s.maxParty) ||
    party < 1 ||
    (confirmationEnd
      ? start.getTime() <= now
      : start.getTime() < now + s.reservationLeadMinutes * 60000) ||
    (!confirmationEnd && start.getTime() > now + s.advanceDays * 86400000) ||
    localParts(start, b.content.settings.timezone).minute % Number(s.slotMinutes) !== 0 ||
    start.getUTCSeconds() !== 0 ||
    start.getUTCMilliseconds() !== 0
  )
    throw new ValidationError('Choose an eligible future reservation slot and party size');
  for (let t = start.getTime(); t < end.getTime(); t += 60000)
    if (!isOpen(b.content.settings.hours, b.content.settings.timezone, new Date(t)))
      throw new ConflictError('Reservation interval is outside opening hours');
  if (s.blackouts.some((v: any) => new Date(v.start) < end && new Date(v.end) > start))
    throw new ConflictError('This interval is unavailable');
  if (party > s.capacity) throw new ConflictError('Not enough covers remain for this interval');
  const overlaps = (
    await repo.execute(c, 'selectReservationAllocations', [
      b.id,
      start,
      end,
      exclude ?? '00000000-0000-0000-0000-000000000000',
    ])
  ).rows;
  overlaps.push(...(await opQuery(c,'walkins',[b.id,b.branch_id])).filter(r=>new Date(r.start_at)<end&&new Date(r.end_at)>start));
  const points = overlaps
    .flatMap((r) => [
      { time: Math.max(new Date(r.start_at).getTime(), start.getTime()), delta: r.covers },
      { time: Math.min(new Date(r.end_at).getTime(), end.getTime()), delta: -r.covers },
    ])
    .sort((a, b) => a.time - b.time || a.delta - b.delta);
  let covers = party;
  for (const p of points) {
    covers += p.delta;
    if (covers > s.capacity) throw new ConflictError('Not enough covers remain for this interval');
  }
  return end;
}
export async function slots(id: string, date: string, party: number) {
  return withTransaction(async (c) => {
    const b = await business(c, id, 'reservations');
    const result = [];
    const from = new Date(date + 'T00:00:00Z').getTime() - 14 * 3600000;
    for (let t = from; t < from + 52 * 3600000; t += 15 * 60000) {
      const start = new Date(t);
      if (localParts(start, b.content.settings.timezone).date !== date) continue;
      try {
        await check(c, b, start, party);
        result.push({
          start: start.toISOString(),
          label: new Intl.DateTimeFormat('en', {
            timeZone: b.content.settings.timezone,
            dateStyle: 'medium',
            timeStyle: 'long',
          }).format(start),
        });
      } catch (e) {
        if (!(e instanceof ValidationError || e instanceof ConflictError)) throw e;
      }
    }
    return {
      timezone: b.content.settings.timezone,
      slots: result,
      capacityModel: 'Branch covers, not assigned tables',
    };
  });
}
export async function requestReservation(scope: Scope, input: any) {
  return withTransaction(async (c) => {
    const b = await business(c, scope.restaurantId, 'reservations'),
      start = new Date(input.start),
      end = await check(c, b, start, input.party);
    const r = (
      await repo.execute(c, 'insertReservations', [
        scope.restaurantId,
        b.branch_id,
        scope.sessionId,
        scope.userId ?? null,
        'RS-' + randomUUID().slice(0, 8).toUpperCase(),
        start,
        end,
        input.party,
        input.contact,
        b.settings.holdMinutes,
      ])
    ).rows[0];
    await repo.execute(c, 'insertReservationAllocations', [
      scope.restaurantId,
      r.id,
      start,
      end,
      input.party,
    ]);
    await history(c, r, 'PENDING', scope.userId ?? null, 'Customer requested reservation');
    return safeReservation(r);
  });
}
async function history(
  c: PoolClient,
  r: any,
  status: string,
  actor: string | null,
  reason: string
) {
  await repo.execute(c, 'insertReservationHistory2', [
    r.restaurant_id,
    r.id,
    status,
    actor,
    reason,
  ]);
  await event(
    c,
    r.restaurant_id,
    'reservation.' + status.toLowerCase(),
    r.id + ':' + (r.version ?? 0),
    r.contact,
    { reservationId: r.id, userId: r.user_id, sessionId: r.session_id }
  );
}
export function safeReservation(r: any) {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    reference: r.reference,
    status:
      r.status === 'PENDING' && new Date(r.hold_expires_at) < new Date() ? 'EXPIRED' : r.status,
    start: r.start_at,
    end: r.end_at,
    party: r.party,
    contact: r.contact,
    version: r.version,
    holdExpiresAt: r.hold_expires_at,
  };
}
export async function customerReservations(scope: Scope) {
  return (
    await repo.execute(pool, 'selectReservations5', [
      scope.restaurantId,
      scope.userId ?? null,
      scope.sessionId,
    ])
  ).rows.map(safeReservation);
}
export async function updateReservation(
  id: string,
  reservationId: string,
  input: { version: number; status?: string; start?: string; reason: string },
  actor: string | null,
  scope?: Scope
) {
  return withTransaction(async (c) => {
    const b = await business(c, id);
    const r = (await repo.execute(c, 'selectReservations6', [id, reservationId])).rows[0];
    if (!r) throw new NotFoundError('Reservation not found');
    if (scope && !(r.user_id ? r.user_id === scope.userId : r.session_id === scope.sessionId))
      throw new NotFoundError('Reservation not found');
    if (r.version !== input.version) throw new ConflictError('Reservation changed. Refresh.');
    if (r.status === 'PENDING' && new Date(r.hold_expires_at) < new Date())
      throw new ConflictError('Reservation request expired. Choose a new slot');
    if (
      scope &&
      (!['PENDING', 'CONFIRMED'].includes(r.status) ||
        new Date(r.start_at) < new Date() ||
        (input.status && input.status !== 'CANCELLED'))
    )
      throw new ConflictError('Customer modification is not permitted');
    if (input.start) {
      await business(c, id, 'reservations');
      const start = new Date(input.start),
        end = await check(c, b, start, r.party, r.id);
      if (!['PENDING', 'CONFIRMED'].includes(r.status))
        throw new ConflictError('Cannot reschedule this reservation');
      await repo.execute(c, 'updateReservations2', [id, r.id, start, end]);
      await repo.execute(c, 'updateReservationAllocations', [id, r.id, start, end]);
      r.version++;
      await history(c, r, 'RESCHEDULED', actor, input.reason);
      return { rescheduled: true };
    }
    const transitions: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
      CONFIRMED: ['SEATED', 'NO_SHOW', 'CANCELLED'],
      SEATED: ['COMPLETED'],
    };
    if (!input.status || !transitions[r.status]?.includes(input.status))
      throw new ConflictError('Invalid reservation transition');
    if(input.status==='SEATED' && (await opQuery(c,'settingsGet',[id]))[0]?.content.tables)throw new ConflictError('Seat this reservation through a table service session');
    if (input.status === 'CONFIRMED')
      await check(c, b, new Date(r.start_at), r.party, r.id, new Date(r.end_at));
    if (
      ['SEATED', 'NO_SHOW'].includes(input.status) &&
      Date.now() < new Date(r.start_at).getTime() - 15 * 60000
    )
      throw new ConflictError('Too early to record arrival or no-show');
    await repo.execute(c, 'updateReservations3', [id, r.id, input.status]);
    if (['DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(input.status))
      await repo.execute(c, 'deleteReservationAllocations', [id, r.id]);
    r.version++;
    await history(c, r, input.status, actor, input.reason);
    return { updated: true };
  });
}
