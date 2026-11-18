import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import request from 'supertest';
import { app, pool } from '../helpers/test-app.js';
import { fixture } from '../helpers/commerce-fixture.js';
import * as core from '../../src/modules/commerce/commerce.service.js';
import * as reservations from '../../src/modules/commerce/reservations.service.js';
import * as payment from '../../src/modules/commerce/payments.service.js';
import * as management from '../../src/modules/commerce/management.service.js';
import { runOutboxOnce, maintenanceOnce } from '../../src/modules/commerce/worker.js';
import { withTransaction } from '../../src/database/transaction.js';
import {
  setAvailability,
  saveDraft,
  publish,
  publicWebsite,
} from '../../src/modules/publishing/publishing.service.js';
import { env } from '../../src/config/env.js';
async function login(email: string) {
  const r = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' });
  return { cookie: r.headers['set-cookie'], csrf: r.body.csrfToken };
}
const future = (extra = 0) =>
  new Date(Math.ceil((Date.now() + 2 * 3600000) / 900000) * 900000 + extra * 60000).toISOString();
test('cart credentials, tenant isolation, client price rejection, exact quotes and account ownership', async () => {
  const f = await fixture();
  const guest = request.agent(app);
  const init = await guest.get(`/api/v1/commerce/${f.a.id}/session`);
  assert.equal(init.status, 200);
  const csrf = init.body.csrf;
  const add = await guest
    .patch(`/api/v1/commerce/${f.a.id}/cart`)
    .set('X-Guest-CSRF', csrf)
    .send({ version: 0, line: { ...f.a.line, price: 1 } });
  assert.equal(add.status, 400);
  assert.equal(
    (await guest.patch(`/api/v1/commerce/${f.a.id}/cart`).send({ version: 0, line: f.a.line }))
      .status,
    403
  );
  assert.equal(
    (
      await guest
        .patch(`/api/v1/commerce/${f.a.id}/cart`)
        .set('X-Guest-CSRF', csrf)
        .send({ version: 0, line: f.a.line })
    ).status,
    200
  );
  const cart = (await guest.get(`/api/v1/commerce/${f.a.id}/cart`)).body;
  assert.equal(cart.lines.length, 1);
  const another = request.agent(app);
  await another.get(`/api/v1/commerce/${f.a.id}/session`);
  assert.equal((await another.get(`/api/v1/commerce/${f.a.id}/cart`)).body.lines.length, 0);
  await assert.rejects(core.mutateCart(f.a.scope, 0, f.b.line), /published menu/);
  const ready = await f.ready();
  assert.equal(ready.quote.content.subtotal, 2602);
  assert.equal(ready.quote.content.tax, 215);
  assert.equal(ready.quote.content.total, 2842);
  const authenticated = { ...f.a.scope, userId: f.customer.id };
  const placed = await core.submitOrder(authenticated, randomUUID(), ready.input);
  await assert.rejects(
    core.customerOrder({ ...f.a.scope, userId: f.other.id }, placed.id),
    /not found/
  );
  await assert.rejects(core.customerOrder(f.a.scope, placed.id), /not found/);
  assert.equal((await management.accountHistory(f.customer.id)).orders.length, 1);
  assert.equal((await management.accountHistory(f.other.id)).orders.length, 0);
});
test('unavailable items, changed/expired quotes and changed totals require fresh confirmation', async () => {
  const f = await fixture(),
    r = await f.ready();
  await setAvailability(f.a.id, f.a.itemId, {
    soldOut: true,
    enabled: true,
    serviceModes: ['takeaway'],
    hours: null,
  });
  await assert.rejects(core.submitOrder(f.a.scope, randomUUID(), r.input), /unavailable/);
  await setAvailability(f.a.id, f.a.itemId, {
    soldOut: false,
    enabled: true,
    serviceModes: ['takeaway'],
    hours: null,
  });
  f.a.draft.items[0].variants[0].price = 2200;
  f.a.draft.settings.name = 'Private draft restaurant name';
  await saveDraft(f.a.id, 1, f.a.draft);
  assert.equal((await publicWebsite(f.a.slug)).commerce.name, 'alpha-cafe');
  await publish(f.a.id, 2, f.owner.id);
  await assert.rejects(
    core.submitOrder(f.a.scope, randomUUID(), r.input),
    (e: any) =>
      e.errorCode === 'QUOTE_CHANGED' && e.details.quote.content.total > r.quote.content.total
  );
  const q = await core.createQuote(f.a.scope);
  await pool.query("UPDATE checkout_quotes SET expires_at=now()-interval '1 second' WHERE id=$1", [
    q.id,
  ]);
  await assert.rejects(
    core.submitOrder(f.a.scope, randomUUID(), { ...r.input, quoteId: q.id }),
    (e: any) => e.errorCode === 'QUOTE_CHANGED'
  );
  assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '0');
  f.a.draft.settings.serviceModes = ['dine_in'];
  await saveDraft(f.a.id, 2, f.a.draft);
  await publish(f.a.id, 3, f.owner.id);
  await assert.rejects(core.createQuote(f.a.scope), /Pickup is not enabled/);
});
test('concurrent order idempotency, mismatch conflicts, lost response recovery and rollback', async () => {
  const f = await fixture(),
    r = await f.ready(),
    key = randomUUID();
  const [a, b] = await Promise.all([
    core.submitOrder(f.a.scope, key, r.input),
    core.submitOrder(f.a.scope, key, r.input),
  ]);
  assert.equal(a.id, b.id);
  assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count, '1');
  assert.equal((await core.submitOrder(f.a.scope, key, r.input)).id, a.id);
  await assert.rejects(
    core.submitOrder(f.a.scope, key, { ...r.input, contact: { ...f.contact, name: 'Different' } }),
    /another payload/
  );
  await assert.rejects(
    withTransaction(async (c) => {
      await core.event(c, f.a.id, 'rolled.back', randomUUID(), f.contact);
      throw new Error('rollback');
    }),
    /rollback/
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM outbox_events WHERE kind='rolled.back'")).rows[0].count,
    '0'
  );
});
test('payment timeout, signed and duplicate/out-of-order callbacks, wrong merchant/amount/currency and suspension', async () => {
  const f = await fixture(),
    o = await f.order(f.a.scope, 'test_online');
  const a = (await pool.query('SELECT * FROM payment_attempts WHERE order_id=$1', [o.id])).rows[0];
  await payment.reconcilePayments(payment.testAdapter(true));
  assert.equal(
    (await pool.query('SELECT status FROM payment_attempts WHERE id=$1', [a.id])).rows[0].status,
    'UNKNOWN'
  );
  assert.equal(
    (
      await pool.query('SELECT count(*) FROM test_provider_ledger WHERE reference=$1', [
        a.provider_reference,
      ])
    ).rows[0].count,
    '1'
  );
  await management.platformChange(
    f.a.id,
    { status: 'suspended', reason: 'Test pending payment suspension' },
    f.owner.id
  );
  await assert.rejects(core.createQuote(f.a.scope), /accepting/);
  const event = {
    eventId: 'provider-event-1',
    reference: a.provider_reference,
    merchant: f.a.id,
    amount: 2842,
    currency: 'USD',
    status: 'PAID',
  };
  await assert.rejects(payment.applyPayment({ ...event, merchant: f.b.id }), /merchant/);
  await assert.rejects(payment.applyPayment({ ...event, amount: 1 }), /mismatch/);
  await assert.rejects(payment.applyPayment({ ...event, currency: 'EUR' }), /mismatch/);
  const raw = Buffer.from(JSON.stringify(event)),
    timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', env.COOKIE_SECRET)
    .update(timestamp + '.')
    .update(raw)
    .digest('hex');
  assert.equal(
    (
      await request(app)
        .post('/api/v1/test/payment-webhook')
        .set('Content-Type', 'application/json')
        .set('X-Test-Timestamp', timestamp)
        .set('X-Test-Signature', '0'.repeat(64))
        .send(raw.toString())
    ).status,
    403
  );
  for (let n = 0; n < 2; n++)
    assert.equal(
      (
        await request(app)
          .post('/api/v1/test/payment-webhook')
          .set('Content-Type', 'application/json')
          .set('X-Test-Timestamp', timestamp)
          .set('X-Test-Signature', signature)
          .send(raw.toString())
      ).status,
      200
    );
  await payment.applyPayment({ ...event, eventId: 'old-pending', status: 'PENDING' });
  assert.equal((await core.customerOrder(f.a.scope, o.id)).paymentStatus, 'PAID');
  assert.equal(
    (await pool.query('SELECT count(*) FROM payment_transactions WHERE order_id=$1', [o.id]))
      .rows[0].count,
    '1'
  );
  // Reconciliation recovers a missing webhook without a new payment identity.
  await pool.query("UPDATE test_provider_ledger SET status='PAID' WHERE reference=$1", [
    a.provider_reference,
  ]);
  await pool.query('UPDATE payment_attempts SET reconcile_after=now() WHERE id=$1', [a.id]);
  await payment.reconcilePayments();
  assert.equal(
    (await pool.query('SELECT count(*) FROM payment_transactions WHERE order_id=$1', [o.id]))
      .rows[0].count,
    '1'
  );
});
test('late payment on cancellation creates independent refund work and concurrency bounds refunds', async () => {
  const f = await fixture(),
    o = await f.order(f.a.scope, 'test_online');
  await core.cancelCustomer(f.a.scope, o.id);
  const a = (await pool.query('SELECT * FROM payment_attempts WHERE order_id=$1', [o.id])).rows[0];
  await payment.applyPayment({
    eventId: 'late-paid',
    reference: a.provider_reference,
    merchant: f.a.id,
    amount: 2842,
    currency: 'USD',
    status: 'PAID',
  });
  const state = await core.customerOrder(f.a.scope, o.id);
  assert.equal(state.status, 'CANCELLED');
  assert.equal(state.paymentStatus, 'PAID');
  assert.equal(state.refunds[0].status, 'PENDING');
  await payment.reconcilePayments();
  assert.equal((await core.customerOrder(f.a.scope, o.id)).refunds[0].status, 'CONFIRMED');
  await assert.rejects(
    core.requestRefund(f.a.id, o.id, 1, f.owner.id, 'extra refund'),
    /remaining/
  );
});
test('fulfillment state guards, collection, partial refund reports and unauthorized/cross-tenant staff', async () => {
  const f = await fixture(),
    o = await f.order();
  let d = await management.staffOrder(f.a.id, o.id);
  await assert.rejects(
    core.staffTransition(f.a.id, o.id, d.version, 'READY', f.owner.id, 'Wrong transition'),
    /Cannot/
  );
  await core.staffTransition(f.a.id, o.id, d.version, 'CONFIRMED', f.owner.id, 'Accepted');
  await assert.rejects(
    core.staffTransition(f.a.id, o.id, d.version, 'CONFIRMED', f.owner.id, 'Concurrent'),
    /changed/
  );
  for (const status of ['PREPARING', 'READY']) {
    d = await management.staffOrder(f.a.id, o.id);
    await core.staffTransition(f.a.id, o.id, d.version, status, f.owner.id, 'Staff workflow');
  }
  d = await management.staffOrder(f.a.id, o.id);
  await assert.rejects(
    core.staffTransition(f.a.id, o.id, d.version, 'COMPLETED', f.owner.id, 'Unpaid'),
    /payment/
  );
  await core.collect(f.a.id, o.id, d.version, f.owner.id);
  d = await management.staffOrder(f.a.id, o.id);
  await core.staffTransition(f.a.id, o.id, d.version, 'COMPLETED', f.owner.id, 'Pickup complete');
  const refunds = await Promise.allSettled([
    core.requestRefund(f.a.id, o.id, 2000, f.owner.id, 'Partial one'),
    core.requestRefund(f.a.id, o.id, 2000, f.owner.id, 'Partial two'),
  ]);
  assert.equal(refunds.filter((r) => r.status === 'fulfilled').length, 1);
  const refund = (refunds.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>)
    .value;
  await core.confirmPickupRefund(f.a.id, refund.id, f.owner.id);
  await f.order();
  const unpaidCancelled = await f.order();
  await core.cancelCustomer(f.a.scope, unpaidCancelled.id);
  const today = new Date().toISOString().slice(0, 10);
  const report = await management.reports(f.a.id, today, today);
  assert.equal(report.completed[0].count, 1);
  assert.equal(report.collections[0].amount, '2842');
  assert.equal(report.refunds[0].amount, '2000');
  assert.equal(String(report.netCollected[0].amount), '842');
  assert.equal(report.topItems[0].quantity, 2);
  assert.equal((await management.reports(f.b.id, today, today)).orders.length, 0);
  const staff = await login(f.staff.email);
  for (const url of [
    `/operations/${f.a.id}/orders/${o.id}/refunds`,
    `/operations/${f.a.id}/orders/${o.id}/collection`,
  ])
    assert.equal(
      (
        await request(app)
          .post('/api/v1' + url)
          .set('Cookie', staff.cookie)
          .set('X-CSRF-Token', staff.csrf)
          .send({ amount: 1, reason: 'Unauthorized' })
      ).status,
      403
    );
  assert.equal(
    (
      await request(app)
        .patch(`/api/v1/operations/${f.a.id}/orders/${o.id}`)
        .set('Cookie', staff.cookie)
        .set('X-CSRF-Token', staff.csrf)
        .send({ version: 99, status: 'CANCELLED', reason: 'Unauthorized' })
    ).status,
    403
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/v1/operations/${f.b.id}/orders/${o.id}`)
        .set('Cookie', staff.cookie)
    ).status,
    404
  );
  const owner = await login(f.owner.email);
  assert.equal(
    (await request(app).get('/api/v1/platform/tenants').set('Cookie', owner.cookie)).status,
    403
  );
});
test('reservations serialize overlapping capacity, expire holds and reschedule atomically', async () => {
  const f = await fixture(),
    start = future();
  const attempt = () =>
    reservations.requestReservation(f.a.scope, { start, party: 3, contact: f.contact });
  const parallel = await Promise.allSettled([attempt(), attempt()]);
  assert.equal(parallel.filter((r) => r.status === 'fulfilled').length, 1);
  const r = (parallel.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
  await assert.rejects(
    reservations.requestReservation(f.a.scope, { start: future(15), party: 2, contact: f.contact }),
    /covers/
  );
  await pool.query(
    "UPDATE reservations SET hold_expires_at=now()-interval '1 second' WHERE id=$1",
    [r.id]
  );
  await assert.rejects(
    reservations.updateReservation(
      f.a.id,
      r.id,
      { version: 0, status: 'CONFIRMED', reason: 'Expired hold' },
      f.owner.id
    ),
    /expired/
  );
  const next = await reservations.requestReservation(f.a.scope, {
    start,
    party: 4,
    contact: f.contact,
  });
  await reservations.updateReservation(
    f.a.id,
    next.id,
    { version: 0, status: 'CONFIRMED', reason: 'Staff confirms' },
    f.owner.id
  );
  const later = await reservations.requestReservation(f.a.scope, {
    start: future(120),
    party: 4,
    contact: f.contact,
  });
  await assert.rejects(
    reservations.updateReservation(
      f.a.id,
      later.id,
      { version: 0, start: future(15), reason: 'Overlapping move' },
      f.owner.id,
      f.a.scope
    ),
    /covers/
  );
  assert.equal(
    (await reservations.customerReservations(f.a.scope))
      .find((v) => v.id === later.id)!
      .start.toISOString(),
    future(120)
  );
  await reservations.updateReservation(
    f.a.id,
    next.id,
    { version: 1, status: 'CANCELLED', reason: 'Guest cancellation' },
    null,
    f.a.scope
  );
  await reservations.updateReservation(
    f.a.id,
    later.id,
    { version: 0, start: future(15), reason: 'Safe move' },
    null,
    f.a.scope
  );
  await assert.rejects(
    reservations.updateReservation(
      f.b.id,
      later.id,
      { version: 1, status: 'CANCELLED', reason: 'Other tenant' },
      f.owner.id
    ),
    /not found/
  );
  await maintenanceOnce();
  assert.equal(
    (await pool.query('SELECT status FROM reservations WHERE id=$1', [r.id])).rows[0].status,
    'EXPIRED'
  );
});
test('durable outbox retries, expired lease recovery, deduplicated in-app effects and failure visibility', async () => {
  const f = await fixture();
  await f.order();
  let sends = 0;
  await runOutboxOnce(async () => {
    sends++;
    throw new Error('SMTP unavailable');
  });
  assert.equal(
    (await pool.query('SELECT state FROM outbox_events LIMIT 1')).rows[0].state,
    'PENDING'
  );
  await pool.query("UPDATE outbox_events SET state='LEASED',lease_until=now()-interval '1 second'");
  await runOutboxOnce(async () => {
    sends++;
    return { success: true };
  });
  assert.equal(sends, 2);
  assert.equal((await pool.query('SELECT count(*) FROM in_app_notifications')).rows[0].count, '1');
  assert.equal(
    (await pool.query('SELECT count(*) FROM notification_deliveries')).rows[0].count,
    '2'
  );
  await runOutboxOnce(async () => {
    throw new Error('Should not resend');
  });
  assert.equal((await pool.query('SELECT state FROM outbox_events LIMIT 1')).rows[0].state, 'DONE');
  await f.order();
  for (let n = 0; n < 8; n++) {
    await pool.query("UPDATE outbox_events SET available_at=now() WHERE state='PENDING'");
    await runOutboxOnce(async () => {
      throw new Error('Persistent SMTP failure');
    });
  }
  const failed = (await pool.query("SELECT id,attempts FROM outbox_events WHERE state='FAILED'"))
    .rows[0];
  assert.equal(failed.attempts, 8);
  const owner = await login(f.owner.email);
  const visible = await request(app)
    .get(`/api/v1/operations/${f.a.id}/notifications/jobs`)
    .set('Cookie', owner.cookie);
  assert.ok(visible.body.some((j: any) => j.id === failed.id && j.state === 'FAILED'));
  assert.equal(
    (
      await request(app)
        .post(`/api/v1/operations/${f.a.id}/notifications/jobs/${failed.id}/retry`)
        .set('Cookie', owner.cookie)
        .set('X-CSRF-Token', owner.csrf)
    ).status,
    200
  );
  await runOutboxOnce(async () => ({ success: true }));
  assert.equal(
    (await pool.query('SELECT attempts,state FROM outbox_events WHERE id=$1', [failed.id])).rows[0]
      .attempts,
    9
  );
});
test('backend plan gates block new business but preserve transaction resolution under suspension', async () => {
  const f = await fixture(),
    o = await f.order();
  await management.platformChange(
    f.a.id,
    { plan: 'basic', reason: 'Pilot restriction' },
    f.owner.id
  );
  await assert.rejects(core.mutateCart(f.a.scope, 0, f.a.line), /accepting/);
  await assert.rejects(
    reservations.requestReservation(f.a.scope, { start: future(), party: 2, contact: f.contact }),
    /accepting/
  );
  await management.platformChange(
    f.a.id,
    { status: 'suspended', reason: 'Controlled suspension' },
    f.owner.id
  );
  const auth = await login(f.owner.email);
  const response = await request(app)
    .patch(`/api/v1/operations/${f.a.id}/orders/${o.id}`)
    .set('Cookie', auth.cookie)
    .set('X-CSRF-Token', auth.csrf)
    .send({ version: 0, status: 'CONFIRMED', reason: 'Resolve existing order' });
  assert.equal(response.status, 200);
  assert.equal((await core.customerOrder(f.a.scope, o.id)).status, 'CONFIRMED');
});

test('missing payment callbacks reconcile from durable provider truth, including expired orders', async () => {
  const f = await fixture(),
    o = await f.order(f.a.scope, 'test_online');
  await payment.reconcilePayments();
  const a = (await pool.query('SELECT * FROM payment_attempts WHERE order_id=$1', [o.id])).rows[0];
  await pool.query("UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1", [o.id]);
  await assert.rejects(
    core.staffTransition(f.a.id, o.id, 1, 'CONFIRMED', f.owner.id, 'Too late'),
    /expired|changed/
  );
  await pool.query("UPDATE test_provider_ledger SET status='PAID' WHERE reference=$1", [
    a.provider_reference,
  ]);
  await pool.query('UPDATE payment_attempts SET reconcile_after=now() WHERE id=$1', [a.id]);
  await payment.reconcilePayments();
  const state = await core.customerOrder(f.a.scope, o.id);
  assert.equal(state.paymentStatus, 'PAID');
  assert.equal(state.status, 'EXPIRED');
  assert.equal(state.refunds.length, 1);
  await reservations.requestReservation(f.a.scope, {
    start: future(),
    party: 2,
    contact: f.contact,
  });
});

test('unknown refund outcomes remain reserved, visible and retry with a durable refund identity', async () => {
  const f = await fixture(),
    o = await f.order(f.a.scope, 'test_online');
  const a = (await pool.query('SELECT * FROM payment_attempts WHERE order_id=$1', [o.id])).rows[0];
  await payment.applyPayment({
    eventId: 'paid-before-refund',
    reference: a.provider_reference,
    merchant: f.a.id,
    amount: 2842,
    currency: 'USD',
    status: 'PAID',
  });
  const refund = await core.requestRefund(f.a.id, o.id, 400, f.owner.id, 'Partial online refund');
  const adapter = payment.testAdapter();
  await payment.reconcilePayments({
    ...adapter,
    refund: async () => {
      throw new Error('Provider refund timeout');
    },
  });
  const pending = (await pool.query('SELECT * FROM refund_requests WHERE id=$1', [refund.id]))
    .rows[0];
  assert.equal(pending.status, 'PENDING');
  assert.match(pending.last_error, /timeout/);
  await assert.rejects(
    core.requestRefund(f.a.id, o.id, 2600, f.owner.id, 'Would over-refund'),
    /remaining/
  );
  await pool.query('UPDATE refund_requests SET reconcile_after=now() WHERE id=$1', [refund.id]);
  await payment.reconcilePayments();
  await payment.reconcilePayments();
  assert.equal(
    (await pool.query('SELECT status FROM refund_requests WHERE id=$1', [refund.id])).rows[0]
      .status,
    'CONFIRMED'
  );
  assert.equal(
    (await pool.query('SELECT count(*) FROM test_provider_refunds WHERE id=$1', [refund.id]))
      .rows[0].count,
    '1'
  );
});

test('report dates use restaurant-local midnight and exclude unpaid orders from cash totals', async () => {
  const f = await fixture(),
    paid = await f.order();
  await core.staffTransition(f.a.id, paid.id, 0, 'CONFIRMED', f.owner.id, 'Accept');
  await core.collect(f.a.id, paid.id, 1, f.owner.id);
  const unpaid = await f.order();
  await pool.query("UPDATE restaurants SET timezone='America/New_York' WHERE id=$1", [f.a.id]);
  await pool.query("UPDATE orders SET created_at='2026-11-18T02:30:00Z' WHERE id=$1", [paid.id]);
  await pool.query("UPDATE orders SET created_at='2026-11-18T15:00:00Z' WHERE id=$1", [unpaid.id]);
  await pool.query(
    "UPDATE payment_transactions SET created_at='2026-11-18T02:30:00Z' WHERE order_id=$1",
    [paid.id]
  );
  const previous = await management.reports(f.a.id, '2026-11-17', '2026-11-17'),
    today = await management.reports(f.a.id, '2026-11-18', '2026-11-18');
  assert.equal(
    previous.orders.reduce((n: number, o: any) => n + o.count, 0),
    1
  );
  assert.equal(previous.collections[0].amount, '2842');
  assert.equal(
    today.orders.reduce((n: number, o: any) => n + o.count, 0),
    1
  );
  assert.equal(today.collections.length, 0);
});

test('accepted-order cancellation requests require explicit authorized review before preparation', async () => {
  const f = await fixture(),
    o = await f.order();
  await core.staffTransition(f.a.id, o.id, 0, 'CONFIRMED', f.owner.id, 'Accept');
  await core.cancelCustomer(f.a.scope, o.id);
  await core.cancelCustomer(f.a.scope, o.id);
  const d = await core.customerOrder(f.a.scope, o.id);
  assert.equal(d.version, 2);
  assert.equal(d.cancellationRequested, true);
  assert.ok(d.history.some((h: any) => h.status === 'CANCELLATION_REQUESTED'));
  await assert.rejects(
    core.staffTransition(f.a.id, o.id, 2, 'PREPARING', f.owner.id, 'Start before review'),
    /Resolve/
  );
  const staff = await login(f.staff.email);
  assert.equal(
    (
      await request(app)
        .post(`/api/v1/operations/${f.a.id}/orders/${o.id}/cancellation-resolution`)
        .set('Cookie', staff.cookie)
        .set('X-CSRF-Token', staff.csrf)
        .send({ version: 2, decision: 'decline', reason: 'Not permitted' })
    ).status,
    403
  );
  await core.resolveCancellation(
    f.a.id,
    o.id,
    2,
    'decline',
    f.owner.id,
    'Already committed resources'
  );
  await core.staffTransition(f.a.id, o.id, 3, 'PREPARING', f.owner.id, 'Continue after review');
  const other = await f.order();
  await core.staffTransition(f.a.id, other.id, 0, 'CONFIRMED', f.owner.id, 'Accept');
  await core.cancelCustomer(f.a.scope, other.id);
  await core.resolveCancellation(
    f.a.id,
    other.id,
    2,
    'approve',
    f.owner.id,
    'Customer request approved'
  );
  assert.equal((await core.customerOrder(f.a.scope, other.id)).status, 'CANCELLED');
});

test('confirmation honors held interval after lead-time passes and publication is removed', async () => {
  const f = await fixture();
  const start = future();
  const r = await reservations.requestReservation(f.a.scope, {
    start,
    party: 2,
    contact: f.contact,
  });
  await pool.query(
    "UPDATE commerce_settings SET content=jsonb_set(content,'{reservationLeadMinutes}','180') WHERE restaurant_id=$1",
    [f.a.id]
  );
  await pool.query('DELETE FROM website_publications WHERE restaurant_id=$1', [f.a.id]);
  await reservations.updateReservation(
    f.a.id,
    r.id,
    { version: 0, status: 'CONFIRMED', reason: 'Resolve existing held reservation' },
    f.owner.id
  );
  assert.equal((await reservations.customerReservations(f.a.scope))[0].status, 'CONFIRMED');
  await assert.rejects(
    reservations.requestReservation(f.a.scope, { start, party: 2, contact: f.contact }),
    /accepting/
  );
  await pool.query(
    'INSERT INTO website_publications(restaurant_id,revision_id) SELECT restaurant_id,id FROM website_revisions WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 1',
    [f.a.id]
  );
  const paidOrder = await f.order();
  await core.staffTransition(f.a.id, paidOrder.id, 0, 'CONFIRMED', f.owner.id, 'Recovery sample');
  await core.collect(f.a.id, paidOrder.id, 1, f.owner.id);
  const paidRefund = await core.requestRefund(
    f.a.id,
    paidOrder.id,
    100,
    f.owner.id,
    'Recovery sample refund'
  );
  await core.confirmPickupRefund(f.a.id, paidRefund.id, f.owner.id);
});
