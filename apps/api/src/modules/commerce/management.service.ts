import { commerceRepository as repo } from './commerce.repository.js';
import type { PoolClient } from 'pg';
import { pool } from '../../database/pool.js';
import { withTransaction } from '../../database/transaction.js';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import { business, safeOrder, transition } from './commerce.service.js';
import { safeReservation } from './reservations.service.js';
export async function readSettings(id: string) {
  return withTransaction(async (c) => {
    const b = await business(c, id);
    return {
      version: b.settingsVersion,
      settings: b.settings,
      entitlements: { ordering: !!b.ordering, reservations: !!b.reservations },
    };
  });
}
export async function saveSettings(id: string, version: number, content: any, actor: string) {
  return withTransaction(async (c) => {
    const b = await business(c, id);
    if (b.settingsVersion !== version) throw new ConflictError('Settings changed');
    await repo.execute(c, 'updateCommerceSettings', [id, content]);
    await repo.execute(c, 'insertAuditLogs4', [actor, id, { version: version + 1 }]);
    return { version: version + 1 };
  });
}
export async function orders(id: string, filter: any) {
  const { offset = 0, limit = 30, status, payment, reference, from, to } = filter;
  return (
    await repo.execute(pool, 'selectOrders6', [
      id,
      status ?? null,
      payment ?? null,
      reference ? reference + '%' : null,
      from ?? null,
      to ?? null,
      limit,
      offset,
    ])
  ).rows.map(safeOrder);
}
export async function staffOrder(id: string, orderId: string) {
  const o = (await repo.execute(pool, 'selectOrders7', [id, orderId])).rows[0];
  if (!o) throw new NotFoundError('Order not found');
  return {
    ...safeOrder(o),
    history: (await repo.execute(pool, 'selectOrderHistory2', [id, orderId])).rows,
    refunds: (await repo.execute(pool, 'selectRefundRequests5', [id, orderId])).rows,
    paymentAttempts: (await repo.execute(pool, 'selectPaymentAttempts', [id, orderId])).rows,
  };
}
export async function reservations(id: string, offset = 0) {
  return (await repo.execute(pool, 'selectReservations2', [id, offset])).rows.map(safeReservation);
}
export async function reports(id: string, from: string, to: string) {
  return withTransaction(async (c) => {
    const b = await business(c, id),
      range = [id, from, to, b.timezone];
    const orders = (await repo.execute(c, 'selectOrders8', range)).rows;
    const completed = (await repo.execute(c, 'selectOrders9', range)).rows;
    const collected = (await repo.execute(c, 'selectPaymentTransactions2', range)).rows;
    const refunds = (await repo.execute(c, 'selectRefundRequests6', range)).rows;
    const topItems = (await repo.execute(c, 'selectOrderItems', range)).rows;
    const bookings = (await repo.execute(c, 'selectReservations3', range)).rows;
    const currencies = [
      ...new Set([...collected, ...refunds, ...completed].map((r) => r.currency)),
    ];
    return {
      from,
      to,
      timezone: b.timezone,
      orders,
      completed,
      collections: collected,
      refunds,
      netCollected: currencies.map((currency) => ({
        currency,
        amount: (
          collected
            .filter((r) => r.currency === currency)
            .reduce((s, r) => s + BigInt(r.amount), 0n) -
          refunds.filter((r) => r.currency === currency).reduce((s, r) => s + BigInt(r.amount), 0n)
        ).toString(),
      })),
      averageOrderValue: completed.map((r) => ({
        currency: r.currency,
        count: r.count,
        amount: r.count
          ? Number((BigInt(r.total) + BigInt(Math.floor(r.count / 2))) / BigInt(r.count))
          : 0,
      })),
      topItems,
      reservations: bookings,
      definition:
        'Orders: creation date. Completed/AOV/top dishes: completion date (gross order totals). Collections/refunds: transaction/confirmation date. Reservations: start date. Cash collections are not profit.',
    };
  });
}
export async function platformTenants(offset = 0) {
  return (await repo.execute(pool, 'selectRestaurants3', [offset])).rows;
}
export async function platformChange(id: string, input: any, actor: string) {
  return withTransaction(async (c) => {
    const b = await business(c, id);
    if (input.status) await repo.execute(c, 'updateRestaurants', [id, input.status]);
    if (input.plan) {
      await repo.execute(c, 'insertTenantSubscriptions', [
        id,
        input.plan,
        input.subscriptionStatus ?? 'manual',
        input.trialEndsAt ?? null,
      ]);
    }
    await repo.execute(c, 'insertAuditLogs5', [actor, id, { previousStatus: b.status, ...input }]);
    return { updated: true };
  });
}
export async function accountHistory(userId: string) {
  return {
    orders: (await repo.execute(pool, 'selectOrders10', [userId])).rows.map(safeOrder),
    reservations: (await repo.execute(pool, 'selectReservations4', [userId])).rows.map(
      safeReservation
    ),
  };
}
export async function profile(id: string, userId: string, content?: any) {
  return withTransaction(async (c) => {
    await business(c, id);
    if (content) {
      const p = (
        await repo.execute(c, 'insertCustomerProfiles', [
          id,
          userId,
          {
            name: content.name,
            phone: content.phone,
            transactionalEmail: content.transactionalEmail,
            marketingConsent: content.marketingConsent,
          },
        ])
      ).rows[0];
      await repo.execute(c, 'deleteCustomerAddresses', [id, p.id]);
      for (const address of content.addresses)
        await repo.execute(c, 'insertCustomerAddresses', [id, p.id, address]);
    }
    const p = (await repo.execute(c, 'selectCustomerProfiles', [id, userId])).rows[0];
    return p
      ? {
          ...p.content,
          addresses: (await repo.execute(c, 'selectCustomerAddresses', [id, p.id])).rows.map(
            (r) => r.content
          ),
        }
      : { name: '', phone: '', transactionalEmail: true, marketingConsent: false, addresses: [] };
  });
}
export async function expireTransactions(c: PoolClient) {
  const due = (await repo.execute(c, 'selectOrders11')).rows;
  for (const d of due) {
    await business(c, d.restaurant_id);
    const o = (await repo.execute(c, 'selectOrders12', [d.id])).rows[0];
    if (o.status === 'PENDING' && new Date(o.expires_at) <= new Date())
      await transition(c, o, 'EXPIRED', null, 'Acceptance timeout');
  }
  const expired = (await repo.execute(c, 'updateReservations')).rows;
  for (const r of expired) {
    await repo.execute(c, 'deleteReservationAllocations', [r.restaurant_id, r.id]);
    await repo.execute(c, 'insertReservationHistory', [r.restaurant_id, r.id]);
  }
  return { orders: due.length, reservations: expired.length };
}

export async function operationsHealth() {
  return (await repo.execute(pool, 'operationsHealth')).rows[0];
}
