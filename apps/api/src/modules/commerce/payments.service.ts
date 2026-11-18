import { commerceRepository as repo } from './commerce.repository.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pool } from '../../database/pool.js';
import { withTransaction } from '../../database/transaction.js';
import { env } from '../../config/env.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error.js';
import { hashPayload } from '../../shared/security/tokens.js';
import { business, event, reserveRefund, transition } from './commerce.service.js';
export interface PaymentAdapter {
  initialize(input: {
    reference: string;
    merchant: string;
    amount: number;
    currency: string;
  }): Promise<{ status: 'PENDING' | 'UNKNOWN' | 'PAID' | 'FAILED' }>;
  retrieve(
    reference: string,
    merchant: string
  ): Promise<{
    status: 'PENDING' | 'UNKNOWN' | 'PAID' | 'FAILED';
    amount: number;
    currency: string;
  }>;
  refund(input: {
    reference: string;
    merchant: string;
    refundId: string;
    amount: number;
  }): Promise<{ status: 'CONFIRMED' | 'PENDING' | 'FAILED' }>;
}
export function testAdapter(timeout = false): PaymentAdapter {
  if (!env.IS_TEST) throw new ForbiddenError('Payment simulation is test-only');
  return {
    async initialize(i) {
      await repo.execute(pool, 'insertTestProviderLedger', [
        i.reference,
        i.merchant,
        i.amount,
        i.currency,
      ]);
      if (timeout) throw new Error('Simulated timeout after provider acceptance');
      return { status: 'PENDING' };
    },
    async retrieve(reference, merchant) {
      const r = (await repo.execute(pool, 'selectTestProviderLedger', [reference, merchant]))
        .rows[0];
      if (!r) throw new NotFoundError('Provider reference not found');
      return { status: r.status, amount: Number(r.amount), currency: r.currency };
    },
    async refund(input) {
      await repo.execute(pool, 'insertTestRefund', [
        input.refundId,
        input.reference,
        input.merchant,
        input.amount,
      ]);
      const existing = (await repo.execute(pool, 'readTestRefund', [input.refundId])).rows[0];
      if (
        existing.reference !== input.reference ||
        existing.merchant !== input.merchant ||
        Number(existing.amount) !== input.amount
      )
        throw new ConflictError('Refund identity reused with different values');
      return { status: existing.status };
    },
  };
}
export async function applyPayment(input: {
  eventId: string;
  reference: string;
  merchant: string;
  amount: number;
  currency: string;
  status: string;
}) {
  return withTransaction(async (c) => {
    const a = (await repo.execute(c, 'selectPaymentAttempts2', [input.merchant, input.reference]))
      .rows[0];
    if (!a) throw new ValidationError('Unknown merchant or payment reference');
    await business(c, a.restaurant_id);
    const o = (await repo.execute(c, 'selectOrders4', [a.restaurant_id, a.order_id])).rows[0];
    if (Number(o.total) !== input.amount || o.currency !== input.currency)
      throw new ValidationError('Payment amount or currency mismatch');
    const inserted = await repo.execute(c, 'insertProviderEvents', [
      input.merchant,
      input.eventId,
      a.restaurant_id,
      hashPayload(input),
    ]);
    if (!inserted.rowCount) {
      const old = (await repo.execute(c, 'selectProviderEvents', [input.merchant, input.eventId]))
        .rows[0];
      if (old.fingerprint !== hashPayload(input))
        throw new ConflictError('Provider event identifier reused with different payload');
      return { duplicate: true };
    }
    if (input.status === 'PAID') {
      if (o.status === 'PENDING' && new Date(o.expires_at) <= new Date()) {
        await transition(c, o, 'EXPIRED', null, 'Payment arrived after acceptance expiry');
        o.status = 'EXPIRED';
      }
      const paid = await repo.execute(c, 'insertPaymentTransactions2', [
        a.restaurant_id,
        o.id,
        input.reference,
        input.amount,
        input.currency,
      ]);
      await repo.execute(c, 'updateOrders5', [o.id]);
      await repo.execute(c, 'updatePaymentAttempts2', [a.id]);
      if (paid.rowCount) {
        await event(c, a.restaurant_id, 'payment.confirmed', o.id, o.contact, {
          orderId: o.id,
          sessionId: o.session_id,
          userId: o.user_id,
        });
        if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(o.status))
          await reserveRefund(
            c,
            a.restaurant_id,
            o.id,
            input.amount,
            null,
            'Late payment on inactive order'
          );
      }
    } else if (o.payment_status !== 'PAID') {
      const status = input.status === 'FAILED' ? 'FAILED' : 'PENDING';
      // A failed attempt cannot regress to pending from an older event; PAID may always settle truth.
      if (a.status !== 'FAILED' || status === 'FAILED') {
        await repo.execute(c, 'updateOrders6', [o.id, status]);
        await repo.execute(c, 'updatePaymentAttempts3', [a.id, status]);
        if (status === 'FAILED')
          await event(c, a.restaurant_id, 'payment.failed', o.id, o.contact, { orderId: o.id });
      }
    }
    return { accepted: true };
  });
}
export function verifyTestSignature(raw: Buffer, signature: string, timestamp: string) {
  if (!env.IS_TEST) throw new ForbiddenError('Test payment callback unavailable');
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
    throw new ForbiddenError('Webhook timestamp is outside tolerance');
  const expected = createHmac('sha256', env.COOKIE_SECRET)
    .update(timestamp + '.')
    .update(raw)
    .digest('hex');
  if (
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new ForbiddenError('Invalid webhook signature');
}
export async function reconcilePayments(adapter?: PaymentAdapter) {
  if (!env.IS_TEST) return { processed: 0, online: 'unconfigured' };
  const provider = adapter ?? testAdapter();
  const due = (await repo.execute(pool, 'selectPaymentAttempts3')).rows;
  for (const a of due) {
    // A short durable claim prevents worker concurrency. No external call occurs in a transaction.
    const claim = await repo.execute(pool, 'updatePaymentAttempts4', [a.id]);
    if (!claim.rowCount) continue;
    try {
      let truth;
      try {
        truth = await provider.retrieve(a.provider_reference, a.merchant);
      } catch (e) {
        if (!(e instanceof NotFoundError)) throw e;
        await provider.initialize({
          reference: a.provider_reference,
          merchant: a.merchant,
          amount: Number(a.total),
          currency: a.currency,
        });
        truth = await provider.retrieve(a.provider_reference, a.merchant);
      }
      await applyPayment({
        eventId: 'reconcile:' + a.provider_reference + ':' + truth.status,
        reference: a.provider_reference,
        merchant: a.merchant,
        amount: truth.amount,
        currency: truth.currency,
        status: truth.status,
      });
    } catch (e) {
      await repo.execute(pool, 'updatePaymentAttempts5', [a.id, (e as Error).message]);
      await repo.execute(pool, 'updateOrders7', [a.order_id]);
    }
  }
  const refunds = (await repo.execute(pool, 'selectRefundRequests7')).rows;
  for (const r of refunds) {
    if (!(await repo.execute(pool, 'claimRefund', [r.id])).rowCount) continue;
    try {
      const outcome = await provider.refund({
        reference: r.provider_reference,
        merchant: r.merchant,
        refundId: r.id,
        amount: Number(r.amount),
      });
      if (outcome.status === 'PENDING') continue;
      await withTransaction(async (c) => {
        const updated = await repo.execute(c, 'updateRefundRequests2', [r.id, outcome.status]);
        if (updated.rowCount) {
          const o = (await repo.execute(c, 'selectOrders13', [r.order_id])).rows[0];
          await event(
            c,
            r.restaurant_id,
            'refund.' + outcome.status.toLowerCase(),
            r.id,
            o.contact,
            { orderId: r.order_id }
          );
        }
      });
    } catch (error) {
      await repo.execute(pool, 'refundRecoveryError', [r.id, (error as Error).message]);
    }
  }

  return { processed: due.length };
}
