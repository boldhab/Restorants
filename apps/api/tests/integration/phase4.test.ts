import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { fixture } from '../helpers/commerce-fixture.js';
import { app, pool } from '../helpers/test-app.js';
import { withTransaction } from '../../src/database/transaction.js';
import { access, args, type Context } from '../../src/modules/operations/access.service.js';
import { q } from '../../src/modules/operations/operations.repository.js';
import * as core from '../../src/modules/commerce/commerce.service.js';
import * as staff from '../../src/modules/operations/staff.service.js';
import * as kitchen from '../../src/modules/operations/kitchen.service.js';
import * as inventory from '../../src/modules/operations/inventory.service.js';
import * as tables from '../../src/modules/operations/tables.service.js';
import * as cash from '../../src/modules/operations/cash-delivery.service.js';
import * as reviews from '../../src/modules/operations/customers-reviews.service.js';
import {
  exportWorkerOnce,
  csvCell,
  pdfReport,
} from '../../src/modules/operations/exports.service.js';
import { publish, saveDraft, readDraft } from '../../src/modules/publishing/publishing.service.js';
import { hashToken } from '../../src/shared/security/tokens.js';
async function setup() {
  const f = await fixture();
  const branch = (
    await pool.query('SELECT id FROM branches WHERE restaurant_id=$1 AND is_default', [f.a.id])
  ).rows[0].id;
  await pool.query('INSERT INTO operational_settings(restaurant_id,content) VALUES($1,$2)', [
    f.a.id,
    {
      kitchen: true,
      tables: true,
      pos: true,
      cash: false,
      inventory: true,
      coupons: true,
      delivery: true,
    },
  ]);
  const ctx = await withTransaction((c) =>
    access(c, f.a.id, branch, f.owner.id, 'operations.configure')
  );
  async function op<T>(
    fn: (c: any, a: Context) => Promise<T>,
    user = f.owner.id,
    permission = 'operations.configure'
  ) {
    return withTransaction(async (c) => fn(c, await access(c, f.a.id, branch, user, permission)));
  }
  async function member(userId: string, role: string) {
    const m = (
      await pool.query(
        "INSERT INTO restaurant_memberships(restaurant_id,user_id) VALUES($1,$2) ON CONFLICT(restaurant_id,user_id) DO UPDATE SET status='active' RETURNING id",
        [f.a.id, userId]
      )
    ).rows[0];
    await pool.query('DELETE FROM membership_roles WHERE membership_id=$1', [m.id]);
    await pool.query(
      'INSERT INTO membership_roles SELECT $1,id FROM roles WHERE restaurant_id IS NULL AND name=$2',
      [m.id, role]
    );
    return m.id;
  }
  async function submitted(scope = f.a.scope, context: any = {}) {
    await core.setOrderContext(scope, context);
    const c = await core.getCart(scope);
    await core.mutateCart(scope, c.version, f.a.line);
    const quote = await core.createQuote(scope);
    return core.submitOrder(scope, randomUUID(), {
      quoteId: quote.id,
      contact: f.contact,
      method: 'pay_at_pickup',
    });
  }
  async function status(id: string, next: string) {
    const o = (await pool.query('SELECT * FROM orders WHERE id=$1', [id])).rows[0];
    return core.staffTransition(f.a.id, id, o.version, next, f.owner.id, 'Integration operation');
  }
  async function allModes() {
    const { draft, version } = await readDraft(f.a.id);
    draft.settings.serviceModes = ['takeaway', 'dine_in', 'delivery'];
    await saveDraft(f.a.id, version, draft);
    await publish(f.a.id, version + 1, f.owner.id);
  }
  return { ...f, branch, ctx, op, member, submitted, status, allModes };
}
test('Phase 4 invitations are verified, email-bound, expiring, revocable, single-use and privilege-limited', async () => {
  const f = await setup();
  const i = await f.op((c, a) =>
    staff.invite(c, a, { email: f.customer.email, role: 'chef', branchId: f.branch })
  );
  const payload = (
    await pool.query(
      "SELECT payload FROM outbox_events WHERE kind='staff.invitation' ORDER BY created_at DESC LIMIT 1"
    )
  ).rows[0].payload;
  const token = payload.invitationUrl.split('#')[1];
  await assert.rejects(
    withTransaction((c) => staff.accept(c, token, { ...f.other, is_email_verified: true })),
    /matching/
  );
  await withTransaction((c) => staff.accept(c, token, { ...f.customer, is_email_verified: true }));
  await assert.rejects(
    withTransaction((c) => staff.accept(c, token, { ...f.customer, is_email_verified: true })),
    /already accepted/
  );
  await assert.rejects(
    f.op(async () => {}, f.customer.id, 'exports.generate'),
    /permission/
  );
  await assert.rejects(
    f.op(async () => {}, f.customer.id, 'customers.read'),
    /permission/
  );
  const expired = 'expired-' + randomUUID();
  await pool.query(
    "UPDATE staff_invitations SET token_hash=$2,consumed_at=NULL,expires_at=now()-interval '1 minute' WHERE id=$1",
    [i.id, hashToken(expired)]
  );
  await assert.rejects(
    withTransaction((c) => staff.accept(c, expired, { ...f.customer, is_email_verified: true })),
    /expired/
  );
  const manager = await f.member(f.other.id, 'manager');
  await assert.rejects(
    f.op(
      (c, a) => staff.invite(c, a, { email: 'x@example.com', role: 'owner', branchId: f.branch }),
      f.other.id,
      'staff.manage'
    ),
    /owners/
  );
  await assert.rejects(
    f.op(
      (c, a) => staff.invite(c, a, { email: 'x@example.com', role: 'manager', branchId: f.branch }),
      f.other.id,
      'staff.manage'
    ),
    /scope/
  );
  await f.op((c, a) =>
    staff.changeMember(c, a, manager, { role: 'rider', active: false, reason: 'Access removed' })
  );
  await assert.rejects(
    f.op(async () => {}, f.other.id, 'delivery.update_assigned'),
    /access/
  );
  await assert.rejects(
    f.op((c, a) =>
      staff.changeMember(c, a, a.membershipId, {
        role: 'chef',
        active: false,
        reason: 'Accidental final owner removal',
      })
    ),
    /final active owner/
  );
  await assert.rejects(
    withTransaction((c) => access(c, f.b.id, f.branch, f.owner.id, 'tables.manage')),
    /access/
  );
});
test('Phase 4 multi-station kitchen work is idempotent, scoped, versioned and gates readiness; preparation cancellation stays auditable', async () => {
  const f = await setup();
  const stations = await f.op(async (c, a) => {
    const x = (await q(c, 'station', [...args(a), 'Grill']))[0],
      y = (await q(c, 'station', [...args(a), 'Drinks']))[0];
    for (const s of [x, y]) await q(c, 'route', [...args(a), f.a.itemId, s.id]);
    return [x, y];
  });
  const order = await f.order();
  await f.status(order.id, 'CONFIRMED');
  await f.op(async (c) => {
    const o = (await q(c, 'order', [f.a.id, order.id]))[0];
    await kitchen.orderEffect(c, o, 'CONFIRMED', 'Replayed event');
  });
  let work = (await pool.query('SELECT * FROM kitchen_work ORDER BY station_id')).rows;
  assert.equal(work.length, 2);
  assert.equal(work[0].snapshot.quantity, 2);
  const chef = await f.member(f.customer.id, 'chef');
  await f.op(async (c, a) => {
    await q(c, 'stationGrant', [...args(a), chef, stations[0].id]);
  });
  const forbidden = work.find((w) => w.station_id === stations[1].id);
  await assert.rejects(
    f.op(
      (c, a) =>
        kitchen.workAction(c, a, forbidden.id, {
          version: 0,
          action: 'start',
          reason: 'Wrong station',
        }),
      f.customer.id,
      'kitchen.update'
    ),
    /Station access/
  );
  for (const [index, w] of work.entries()) {
    await f.op((c, a) =>
      kitchen.workAction(c, a, w.id, { version: 0, action: 'start', reason: 'Started work' })
    );
    await assert.rejects(
      f.op((c, a) =>
        kitchen.workAction(c, a, w.id, { version: 0, action: 'ready', reason: 'Stale request' })
      ),
      /changed/
    );
    await f.op((c, a) =>
      kitchen.workAction(c, a, w.id, { version: 1, action: 'ready', reason: 'Work finished' })
    );
    const o = (await pool.query('SELECT status FROM orders WHERE id=$1', [order.id])).rows[0];
    assert.equal(o.status, index === 0 ? 'PREPARING' : 'READY');
  }
  await f.status(order.id, 'CANCELLED');
  work = (await pool.query('SELECT * FROM kitchen_work')).rows;
  assert.ok(work.every((w) => w.state === 'CANCELLED'));
  assert.equal(work.length, 2);
});
test('Phase 4 stock reserves concurrently, consumes once, preserves recipe versions and releases only unprepared stock', async () => {
  const f = await setup();
  const { ingredient, location } = await f.op(async (c, a) => ({
    ingredient: (await q(c, 'ingredient', [...args(a), 'Coffee', 'g', 100]))[0],
    location: (await q(c, 'location', [...args(a), 'Main']))[0],
  }));
  await f.op((c, a) =>
    inventory.adjustStock(c, a, {
      ingredientId: ingredient.id,
      locationId: location.id,
      quantity: 3000,
      unit: 'g',
      kind: 'OPENING',
      reason: 'Initial count',
      key: 'opening-stock',
    })
  );
  await assert.rejects(
    f.op((c, a) =>
      inventory.adjustStock(c, a, {
        ingredientId: ingredient.id,
        locationId: location.id,
        quantity: 1,
        unit: 'ml',
        kind: 'RECEIPT',
        reason: 'Wrong dimension',
        key: 'wrong-dimension',
      })
    ),
    /dimension/
  );
  await f.op((c, a) =>
    inventory.saveRecipe(c, a, {
      itemId: f.a.itemId,
      variantId: null,
      optionId: null,
      locationId: location.id,
      components: [{ ingredientId: ingredient.id, quantity: 1000 }],
    })
  );
  const x = await f.order(),
    y = await f.order();
  const results = await Promise.allSettled([
    f.status(x.id, 'CONFIRMED'),
    f.status(y.id, 'CONFIRMED'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const accepted = results[0].status === 'fulfilled' ? x : y;
  await f.op((c, a) =>
    inventory.saveRecipe(c, a, {
      itemId: f.a.itemId,
      variantId: null,
      optionId: null,
      locationId: location.id,
      components: [{ ingredientId: ingredient.id, quantity: 5000 }],
    })
  );
  await f.op(async (c) => {
    const order = (await q(c, 'order', [f.a.id, accepted.id]))[0];
    await kitchen.orderEffect(c, order, 'CONFIRMED', 'Acceptance event replay after recipe edit');
  });
  await f.status(accepted.id, 'PREPARING');
  await f.op(async (c) => {
    await inventory.resolveIngredients(c, (await q(c, 'order', [f.a.id, accepted.id]))[0], true);
  });
  let balance = (
    await pool.query('SELECT * FROM stock_balances WHERE ingredient_id=$1', [ingredient.id])
  ).rows[0];
  assert.equal(Number(balance.quantity), 1000);
  assert.equal(Number(balance.reserved), 0);
  assert.equal(
    (await pool.query("SELECT * FROM stock_movements WHERE kind='CONSUMPTION'")).rows.length,
    1
  );
  await f.status(accepted.id, 'CANCELLED');
  balance = (
    await pool.query('SELECT * FROM stock_balances WHERE ingredient_id=$1', [ingredient.id])
  ).rows[0];
  assert.equal(Number(balance.quantity), 1000);
  await assert.rejects(pool.query('UPDATE stock_movements SET quantity=0'), /Append-only/);
});
test('Phase 4 concurrent seating, capacity, atomic movement, unsettled bills and closed QR access', async () => {
  const f = await setup();
  await f.allModes();
  const ts = await f.op(async (c, a) => {
    const area = (await q(c, 'area', [...args(a), 'Main room']))[0];
    return Promise.all(
      ['One', 'Two'].map((n) => q(c, 'table', [...args(a), area.id, n, 2]).then((r) => r[0]))
    );
  });
  const input = {
    tableId: ts[0].id,
    party: 2,
    expectedEnd: new Date(Date.now() + 3600000).toISOString(),
  };
  const r = await Promise.allSettled([
    f.op((c, a) => tables.openVisit(c, a, input)),
    f.op((c, a) => tables.openVisit(c, a, input)),
  ]);
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1, JSON.stringify(r));
  const visit = (r.find((x) => x.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
  const qr = await f.op((c, a) => tables.rotateQR(c, a, ts[0].id));
  await assert.rejects(
    withTransaction((c) =>
      tables.joinTable(c, f.a.id, f.a.scope.sessionId, qr.reference, 'wrongactivation')
    ),
    /activation/
  );
  const joined = await withTransaction((c) =>
    tables.joinTable(c, f.a.id, f.a.scope.sessionId, qr.reference, visit.activation)
  );
  const scope = { ...f.a.scope, tableToken: joined.token };
  const otherDiner = (
    await pool.query(
      'INSERT INTO commerce_sessions(restaurant_id,token_hash) VALUES($1,$2) RETURNING id',
      [f.a.id, randomUUID()]
    )
  ).rows[0];
  const otherGrant = await withTransaction((c) =>
    tables.joinTable(c, f.a.id, otherDiner.id, qr.reference, visit.activation)
  );
  const order = await f.submitted(scope, {
    channel: 'qr',
    mode: 'dine_in',
    serviceSessionId: visit.id,
  });
  await assert.rejects(
    core.customerOrder(
      { restaurantId: f.a.id, sessionId: otherDiner.id, tableToken: otherGrant.token },
      order.id
    ),
    /not found/
  );
  await assert.rejects(
    f.op((c, a) =>
      tables.updateVisit(c, a, visit.id, { version: 0, action: 'close', reason: 'Too early' })
    ),
    /Resolve/
  );
  await f.op((c, a) =>
    tables.updateVisit(c, a, visit.id, {
      version: 0,
      action: 'move',
      tableId: ts[1].id,
      reason: 'Move requested',
    })
  );
  const rows = (await pool.query("SELECT * FROM service_sessions WHERE status='OPEN'")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].table_id, ts[1].id);
  await f.status(order.id, 'CANCELLED');
  await f.op((c, a) =>
    tables.updateVisit(c, a, visit.id, { version: 1, action: 'close', reason: 'Visit settled' })
  );
  await assert.rejects(
    core.setOrderContext(scope, { channel: 'qr', mode: 'dine_in', serviceSessionId: visit.id }),
    /activation/
  );
  const other = { ...f.b.scope };
  await assert.rejects(core.customerOrder(other, order.id), /not found/);
  await assert.rejects(
    core.customerOrder({ ...scope, sessionId: f.b.scope.sessionId }, order.id),
    /not found/
  );
  await f.op((c, a) => tables.rotateQR(c, a, ts[0].id));
  await assert.rejects(
    withTransaction((c) =>
      tables.joinTable(c, f.a.id, f.a.scope.sessionId, qr.reference, visit.activation)
    ),
    /not found/
  );
});
test('Phase 4 reservation seating transfers covers and walk-ins participate in capacity checks', async () => {
  const f = await setup();
  const reservation = (
    await pool.query(
      "INSERT INTO reservations(restaurant_id,branch_id,session_id,reference,status,start_at,end_at,party,contact,hold_expires_at) VALUES($1,$2,$3,'RS-SEAT','CONFIRMED',now()-interval '1 minute',now()+interval '1 hour',4,$4,now()+interval '1 hour') RETURNING *",
      [f.a.id, f.branch, f.a.scope.sessionId, f.contact]
    )
  ).rows[0];
  await pool.query('INSERT INTO reservation_allocations VALUES($1,$2,$3,$4,4)', [
    f.a.id,
    reservation.id,
    reservation.start_at,
    reservation.end_at,
  ]);
  const table = await f.op(async (c, a) => {
    const area = (await q(c, 'area', [...args(a), 'Room']))[0];
    return (await q(c, 'table', [...args(a), area.id, 'Four', 4]))[0];
  });
  const s = await f.op((c, a) =>
    tables.openVisit(c, a, {
      tableId: table.id,
      party: 4,
      reservationId: reservation.id,
      expectedEnd: new Date(Date.now() + 3600000).toISOString(),
    })
  );
  assert.equal(
    (
      await pool.query('SELECT * FROM reservation_allocations WHERE reservation_id=$1', [
        reservation.id,
      ])
    ).rows.length,
    0
  );
  const commitments = await f.op((c, a) => q(c, 'commitments', [...args(a), null, null]));
  assert.equal(commitments.length, 1);
  assert.equal(commitments[0].covers, 4);
  assert.throws(
    () => tables.capacityCheck(commitments, new Date(), new Date(Date.now() + 1800000), 1, 4),
    /capacity/
  );
  await f.op((c, a) =>
    tables.updateVisit(c, a, s.id, { version: 0, action: 'close', reason: 'Visit ended' })
  );
  assert.equal(
    (await pool.query('SELECT status FROM reservations WHERE id=$1', [reservation.id])).rows[0]
      .status,
    'COMPLETED'
  );
});
test('Phase 4 POS idempotency and cash collection/closure serialize and closed ledgers remain immutable', async () => {
  const f = await setup();
  await f.op(async (c, a) => {
    await q(c, 'settingsSave', [
      a.restaurantId,
      {
        kitchen: false,
        tables: true,
        pos: true,
        cash: true,
        inventory: false,
        coupons: true,
        delivery: true,
      },
    ]);
  });
  const { quote } = await f.ready();
  const input = { quoteId: quote.id, contact: f.contact, method: 'pay_at_pickup' };
  const key = randomUUID();
  const [x, y] = await Promise.all([
    core.submitOrder(f.a.scope, key, input),
    core.submitOrder(f.a.scope, key, input),
  ]);
  assert.equal(x.id, y.id);
  await f.status(x.id, 'CONFIRMED');
  const register = await f.op(async (c, a) => (await q(c, 'register', [...args(a), 'Counter']))[0]);
  const s = await f.op((c, a) => cash.openCash(c, a, { registerId: register.id, opening: 1000 }));
  await assert.rejects(
    f.op((c, a) => cash.openCash(c, a, { registerId: register.id, opening: 0 })),
    /duplicate/
  );
  const collection = {
    action: 'SALE',
    orderId: x.id,
    key: 'sale:' + x.id,
    reason: 'Cash received',
  };
  await f.op((c, a) => cash.cashAction(c, a, s.id, collection));
  await f.op((c, a) => cash.cashAction(c, a, s.id, collection));
  assert.equal((await pool.query("SELECT * FROM cash_movements WHERE kind='SALE'")).rows.length, 1);
  const second = await f.order();
  await f.status(second.id, 'CONFIRMED');
  const race = await Promise.allSettled([
    f.op((c, a) =>
      cash.cashAction(c, a, s.id, {
        action: 'SALE',
        orderId: second.id,
        key: 'sale:' + second.id,
        reason: 'Cash received',
      })
    ),
    f.op((c, a) =>
      cash.cashAction(c, a, s.id, { action: 'close', counted: 3842, reason: 'Closing drawer' })
    ),
  ]);
  assert.ok(race.some((r) => r.status === 'fulfilled'));
  const closed = (await pool.query('SELECT * FROM cash_sessions WHERE id=$1', [s.id])).rows[0];
  assert.equal(closed.status, 'CLOSED', JSON.stringify(race));
  const movement = (
    await pool.query(
      "SELECT sum(amount) n FROM cash_movements WHERE cash_session_id=$1 AND kind='SALE'",
      [s.id]
    )
  ).rows[0];
  assert.equal(Number(closed.expected), 1000 + Number(movement.n));
  assert.equal(Number(closed.variance), 3842 - Number(closed.expected));
  await assert.rejects(
    f.op((c, a) =>
      cash.cashAction(c, a, s.id, {
        action: 'IN',
        amount: 1,
        key: 'after-close',
        reason: 'Invalid movement',
      })
    ),
    /closed/
  );
  await assert.rejects(
    pool.query('UPDATE cash_sessions SET opening=0 WHERE id=$1', [s.id]),
    /immutable/
  );
});
test('Phase 4 coupon checkout races, expiry and immutable original discount allocation', async () => {
  const f = await setup();
  const coupon = {
    code: 'LASTONE',
    kind: 'percent',
    value: 1000,
    minimum: 0,
    maximum: 0,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    limit: 1,
    perCustomer: 0,
    itemIds: [],
    categoryIds: [],
    modes: ['pickup'],
    active: true,
  };
  await f.op((c, a) => q(c, 'coupon', [...args(a), coupon.code, coupon]));
  const session = (
    await pool.query(
      'INSERT INTO commerce_sessions(restaurant_id,token_hash) VALUES($1,$2) RETURNING id',
      [f.a.id, randomUUID()]
    )
  ).rows[0];
  const scopes = [f.a.scope, { restaurantId: f.a.id, sessionId: session.id }];
  const inputs = [];
  for (const scope of scopes) {
    await core.setOrderContext(scope, { coupon: 'LASTONE' });
    const cart = await core.getCart(scope);
    await core.mutateCart(scope, cart.version, f.a.line);
    const quote = await core.createQuote(scope);
    assert.equal(quote.content.discount, 260);
    assert.equal(quote.content.lines[0].discountedTotal, 2342);
    inputs.push({ quoteId: quote.id, contact: f.contact, method: 'pay_at_pickup' });
  }
  const result = await Promise.allSettled(
    scopes.map((scope, i) => core.submitOrder(scope, randomUUID(), inputs[i]))
  );
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(result));
  const order = (result.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
  await f.status(order.id, 'CONFIRMED');
  let o = (await pool.query('SELECT * FROM orders WHERE id=$1', [order.id])).rows[0];
  await core.collect(f.a.id, o.id, o.version, f.owner.id);
  await core.requestRefund(f.a.id, o.id, 100, f.owner.id, 'Partial discounted refund');
  await f.op((c, a) =>
    q(c, 'coupon', [
      ...args(a),
      coupon.code,
      { ...coupon, value: 9000, endsAt: new Date(Date.now() - 1).toISOString() },
    ])
  );
  o = (await pool.query('SELECT * FROM orders WHERE id=$1', [order.id])).rows[0];
  assert.equal(o.snapshot.discount, 260);
  assert.equal(o.snapshot.lines[0].discountedTotal, 2342);
  const failedScope = result[0].status === 'rejected' ? scopes[0] : scopes[1];
  await assert.rejects(core.createQuote(failedScope), /expired/);
  await assert.rejects(
    core.requestRefund(f.a.id, o.id, Number(o.total), f.owner.id, 'Excessive refund'),
    /remaining/
  );
});
test('Phase 4 rider reassignment immediately revokes contact access and milestones never fabricate settlement', async () => {
  const f = await setup();
  await f.member(f.customer.id, 'rider');
  await f.member(f.other.id, 'rider');
  const o = await f.order();
  await f.status(o.id, 'CONFIRMED');
  // Delivery fixture uses an immutable delivery snapshot created by checkout, never editing an order.
  await f.allModes();
  const zone = await f.op(
    async (c, a) => (await q(c, 'zone', [...args(a), 'Bole', 'Bole area only', 500, true]))[0]
  );
  await core.setOrderContext(f.a.scope, {
    mode: 'delivery',
    zoneId: zone.id,
    address: 'Bole Road 12',
  });
  const cart = await core.getCart(f.a.scope);
  await core.mutateCart(f.a.scope, cart.version, f.a.line);
  const quote = await core.createQuote(f.a.scope);
  await assert.rejects(
    core.submitOrder(f.a.scope, randomUUID(), {
      quoteId: quote.id,
      contact: f.contact,
      method: 'pay_at_pickup',
    }),
    /prepaid/
  );
  const delivery = await core.submitOrder(
    f.a.scope,
    randomUUID(),
    { quoteId: quote.id, contact: f.contact, method: 'test_online' },
    true
  );
  // Actual simulated provider payment record, not a fulfillment side effect.
  await f.op(async (c, a) => {
    await q(c, 'paid', [a.restaurantId, delivery.id, 'test-delivery', quote.content.total, 'USD']);
    await q(c, 'paidOrder', [a.restaurantId, delivery.id]);
  });
  await f.status(delivery.id, 'CONFIRMED');
  let assignment = await f.op((c, a) =>
    cash.assignDelivery(c, a, {
      orderId: delivery.id,
      riderId: f.customer.id,
      reason: 'First rider',
    })
  );
  await f.op(
    (c, a) =>
      cash.deliveryAction(c, a, assignment.id, {
        version: 0,
        state: 'ACCEPTED',
        reason: 'Accepted assignment',
      }),
    f.customer.id,
    'delivery.update_assigned'
  );
  await assert.rejects(
    f.op(
      (c, a) =>
        cash.deliveryAction(c, a, assignment.id, {
          version: 1,
          state: 'PICKED_UP',
          reason: 'Premature pickup',
        }),
      f.customer.id,
      'delivery.update_assigned'
    ),
    /ready/
  );
  assignment = await f.op((c, a) =>
    cash.assignDelivery(c, a, {
      orderId: delivery.id,
      riderId: f.other.id,
      reason: 'Rider reassignment',
    })
  );
  await assert.rejects(
    f.op(
      (c, a) =>
        cash.deliveryAction(c, a, assignment.id, {
          version: assignment.version,
          state: 'ACCEPTED',
          reason: 'Old rider attempt',
        }),
      f.customer.id,
      'delivery.update_assigned'
    ),
    /accessible/
  );
  const list = await f.op(
    (c, a) => q(c, 'deliveries', [...args(a), false, a.userId]),
    f.customer.id,
    'delivery.update_assigned'
  );
  assert.equal(list.length, 0);
  await assert.rejects(
    f.op(async () => {}, f.other.id, 'customers.read'),
    /permission/
  );
});
test('Phase 4 verified reviews enforce ownership, uniqueness, transparent moderation and private notes', async () => {
  const f = await setup();
  const scope = { ...f.a.scope, userId: f.customer.id };
  const o = await f.order(scope);
  await f.status(o.id, 'CONFIRMED');
  await f.status(o.id, 'PREPARING');
  const work = await f.op((c, a) => q(c, 'board', [...args(a), null, true, a.membershipId]));
  for (const w of work) {
    await f.op((c, a) =>
      kitchen.workAction(c, a, w.id, { version: 0, action: 'start', reason: 'Start' })
    );
    await f.op((c, a) =>
      kitchen.workAction(c, a, w.id, { version: 1, action: 'ready', reason: 'Ready' })
    );
  }
  const current = (await pool.query('SELECT * FROM orders WHERE id=$1', [o.id])).rows[0];
  await core.collect(f.a.id, o.id, current.version, f.owner.id);
  await f.status(o.id, 'COMPLETED');
  await assert.rejects(
    withTransaction((c) =>
      reviews.submitReview(c, { ...scope, userId: f.other.id }, o.id, {
        rating: 5,
        comment: 'Not mine',
      })
    ),
    /ownership/
  );
  const r = await withTransaction((c) =>
    reviews.submitReview(c, scope, o.id, { rating: 1, comment: 'Honest negative review' })
  );
  await assert.rejects(
    withTransaction((c) =>
      reviews.submitReview(c, scope, o.id, { rating: 5, comment: 'Duplicate' })
    ),
    /already/
  );
  let aggregate = (
    await pool.query(
      "SELECT count(*),avg(rating) avg FROM verified_reviews WHERE status='PUBLISHED'"
    )
  ).rows[0];
  assert.equal(Number(aggregate.avg), 1);
  await assert.rejects(
    f.op((c, a) => reviews.moderateReview(c, a, r.id, { status: 'HIDDEN', reason: 'Low score' })),
    /transparent/
  );
  await f.op((c, a) =>
    reviews.moderateReview(c, a, r.id, {
      response: 'Thank you for the feedback',
      reason: 'Owner response',
    })
  );
  await f.op((c, a) =>
    q(c, 'note', [...args(a), f.customer.id, 'Restricted sensitive note', a.userId])
  );
  const safe = await core.customerOrder(scope, o.id);
  assert.equal(JSON.stringify(safe).includes('Restricted sensitive'), false);
  aggregate = (
    await pool.query(
      "SELECT count(*),avg(rating) avg FROM verified_reviews WHERE status='PUBLISHED'"
    )
  ).rows[0];
  assert.equal(Number(aggregate.count), 1);
});
test('Phase 4 private CSV/PDF jobs recheck permissions, expire, escape formulas and survive worker restart', async () => {
  const f = await setup();
  await f.member(f.customer.id, 'chef');
  await assert.rejects(
    f.op(async () => {}, f.customer.id, 'exports.generate'),
    /permission/
  );
  const filters = { from: '2026-01-01', to: '2027-01-01' };
  const job = await f.op(
    async (c, a) => (await q(c, 'export', [...args(a), a.userId, 'customers', 'csv', filters]))[0]
  );
  await exportWorkerOnce();
  let result = (await pool.query('SELECT * FROM export_jobs WHERE id=$1', [job.id])).rows[0];
  assert.equal(result.state, 'DONE');
  assert.ok(Buffer.isBuffer(result.bytes));
  assert.equal(csvCell(' \t=HYPERLINK("x")').startsWith('"\''), true);
  assert.equal(
    pdfReport({ metadata: { name: 'Report' }, rows: [{ value: 'Hello' }] })
      .subarray(0, 8)
      .toString(),
    '%PDF-1.4'
  );
  await pool.query("UPDATE export_jobs SET expires_at=now()-interval '1 second' WHERE id=$1", [
    job.id,
  ]);
  await exportWorkerOnce();
  result = (await pool.query('SELECT * FROM export_jobs WHERE id=$1', [job.id])).rows[0];
  assert.equal(result.bytes, null);
  const member = await f.member(f.other.id, 'accountant');
  const revokedJob = await f.op(
    async (c, a) => (await q(c, 'export', [...args(a), f.other.id, 'orders', 'pdf', filters]))[0]
  );
  await pool.query("UPDATE restaurant_memberships SET status='revoked' WHERE id=$1", [member]);
  await exportWorkerOnce();
  assert.equal(
    (await pool.query('SELECT state FROM export_jobs WHERE id=$1', [revokedJob.id])).rows[0].state,
    'FAILED'
  );
});

test('Phase 4 polling and export downloads reauthorize membership and branch on every request', async () => {
  const f = await setup();
  const chef = await f.member(f.customer.id, 'chef');
  const { env } = await import('../../src/config/env.js');
  const token = randomUUID();
  await pool.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [f.customer.id, hashToken(token)]
  );
  const cookie = `${env.COOKIE_NAME}=${token}`;
  const url = `/api/v1/ops/${f.a.id}/kitchen`;
  assert.equal(
    (await request(app).get(`/api/v1/restaurants/${f.a.id}`).set('Cookie', cookie)).status,
    200
  );
  assert.equal((await request(app).get(url).set('Cookie', cookie)).status, 200);
  assert.equal(
    (
      await request(app)
        .get(url + '?branchId=' + randomUUID())
        .set('Cookie', cookie)
    ).status,
    403
  );
  assert.equal(
    (await request(app).get(`/api/v1/ops/${f.a.id}/customers`).set('Cookie', cookie)).status,
    403
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/v1/ops/${f.a.id}/exports/${randomUUID()}/download`)
        .set('Cookie', cookie)
    ).status,
    403
  );
  await pool.query("UPDATE restaurant_memberships SET status='revoked' WHERE id=$1", [chef]);
  assert.equal((await request(app).get(url).set('Cookie', cookie)).status, 403);
  // Reconnect after a missed event fetches current server state, with no durable subscription grant.
  await pool.query("UPDATE restaurant_memberships SET status='active' WHERE id=$1", [chef]);
  assert.equal((await request(app).get(url).set('Cookie', cookie)).status, 200);
  await pool.query('DELETE FROM branch_access WHERE membership_id=$1', [chef]);
  assert.equal((await request(app).get(url).set('Cookie', cookie)).status, 403);
});

test('Phase 4 operational HTTP retries recover one setup effect, reject changed payloads, and prepared waste never deducts twice', async () => {
  const f = await setup();
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: f.owner.email, password: 'Password123!' });
  assert.equal(login.status, 200);
  const cookies = login.headers['set-cookie'];
  const csrf = login.body.csrfToken;
  const url = `/api/v1/ops/${f.a.id}/areas`;
  async function create(name: string, key = 'stable-setup-key') {
    return request(app)
      .post(url)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', key)
      .send({ name });
  }
  const [x, y] = await Promise.all([create('Retry room'), create('Retry room')]);
  assert.equal(x.status, 200, JSON.stringify(x.body));
  assert.equal(y.status, 200);
  assert.equal(x.body.id, y.body.id);
  assert.equal(
    (await pool.query("SELECT * FROM dining_areas WHERE name='Retry room'")).rows.length,
    1
  );
  assert.equal((await create('Changed room')).status, 409);
  const resources = await f.op(async (c, a) => ({
    ingredient: (await q(c, 'ingredient', [...args(a), 'Rice', 'g', 0]))[0],
    location: (await q(c, 'location', [...args(a), 'Main']))[0],
  }));
  await f.op((c, a) =>
    inventory.adjustStock(c, a, {
      ingredientId: resources.ingredient.id,
      locationId: resources.location.id,
      quantity: 10000,
      unit: 'g',
      kind: 'RECEIPT',
      reason: 'Stock received',
      key: 'waste-opening',
    })
  );
  await f.op((c, a) =>
    inventory.saveRecipe(c, a, {
      itemId: f.a.itemId,
      variantId: null,
      optionId: null,
      locationId: resources.location.id,
      components: [{ ingredientId: resources.ingredient.id, quantity: 1000 }],
    })
  );
  const o = await f.order();
  await f.status(o.id, 'CONFIRMED');
  await f.status(o.id, 'PREPARING');
  const r = (
    await pool.query("SELECT * FROM stock_reservations WHERE order_id=$1 AND state='CONSUMED'", [
      o.id,
    ])
  ).rows[0];
  const input = {
    reservationId: r.id,
    quantity: 1000,
    key: 'prepared-waste-1',
    reason: 'Prepared item discarded',
  };
  await f.op((c, a) => inventory.preparedWaste(c, a, input));
  await f.op((c, a) => inventory.preparedWaste(c, a, input));
  assert.equal(
    (
      await pool.query('SELECT quantity FROM stock_balances WHERE ingredient_id=$1', [
        resources.ingredient.id,
      ])
    ).rows[0].quantity,
    '8000'
  );
  assert.equal(
    (
      await pool.query(
        "SELECT waste_quantity,quantity FROM stock_movements WHERE kind='PREPARED_WASTE'"
      )
    ).rows[0].quantity,
    '0'
  );
  await assert.rejects(
    f.op((c, a) =>
      inventory.preparedWaste(c, a, { ...input, key: 'prepared-waste-2', quantity: 2000 })
    ),
    /exceeds consumed/
  );
});

test('Phase 4 personal coupon limits require the customer identity, reject guest POS, and release pending cancellation', async () => {
  const f = await setup();
  const rule = {
    code: 'PERSONAL',
    kind: 'fixed',
    value: 100,
    minimum: 0,
    maximum: 0,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    limit: 20,
    perCustomer: 1,
    itemIds: [],
    categoryIds: [],
    modes: ['pickup'],
    active: true,
  };
  await f.op((c, a) => q(c, 'coupon', [...args(a), rule.code, rule]));
  await assert.rejects(f.submitted(f.a.scope, { coupon: 'PERSONAL' }), /verified customer/);
  await assert.rejects(
    f.submitted({ ...f.a.scope, userId: f.owner.id }, { channel: 'pos', coupon: 'PERSONAL' }),
    /own authenticated checkout/
  );
  const scope = { ...f.a.scope, userId: f.customer.id };
  const order = await f.submitted(scope, { coupon: 'PERSONAL' });
  await assert.rejects(f.submitted(scope, { coupon: 'PERSONAL' }), /redemption limit/);
  await core.cancelCustomer(scope, order.id);
  const replacement = await f.submitted(scope, { coupon: 'PERSONAL' });
  assert.ok(replacement.id);
  assert.notEqual(replacement.id, order.id);
});

test('Phase 4 POS guest records stay staff-private after revocation and emailed reviews disclose no order data', async () => {
  const f = await setup();
  const member = await f.member(f.other.id, 'cashier');
  const scope = { ...f.a.scope, userId: f.other.id };
  await core.setOrderContext(scope, { channel: 'pos' });
  const cart = await core.getCart(scope);
  await core.mutateCart(scope, cart.version, f.a.line);
  const quote = await core.createQuote(scope);
  const input = { quoteId: quote.id, contact: f.contact, method: 'pay_at_pickup' };
  const key = randomUUID();
  const order = await core.submitOrder(scope, key, input);
  assert.equal(order.status, 'CONFIRMED');
  assert.equal((await core.submitOrder(scope, key, input)).id, order.id);
  await assert.rejects(core.customerOrder(scope, order.id), /not found/);
  await assert.rejects(core.cancelCustomer(scope, order.id), /not found/);
  const list = (
    await pool.query(
      "SELECT * FROM orders WHERE restaurant_id=$1 AND (user_id=$2 OR (user_id IS NULL AND session_id=$3 AND COALESCE(snapshot->>'channel','online')<>'pos'))",
      [f.a.id, scope.userId, scope.sessionId]
    )
  ).rows;
  assert.equal(list.length, 0);
  const work = (await pool.query('SELECT * FROM kitchen_work WHERE restaurant_id=$1', [f.a.id]))
    .rows;
  for (const w of work) {
    await f.op((c, a) =>
      kitchen.workAction(c, a, w.id, { version: 0, action: 'start', reason: 'Prepare order' })
    );
    await f.op((c, a) =>
      kitchen.workAction(c, a, w.id, { version: 1, action: 'ready', reason: 'Ready order' })
    );
  }
  const current = (await pool.query('SELECT * FROM orders WHERE id=$1', [order.id])).rows[0];
  await core.collect(f.a.id, order.id, current.version, f.owner.id);
  await f.status(order.id, 'COMPLETED');
  await f.op((c, a) => reviews.inviteReview(c, a, order.id));
  const url = (
    await pool.query(
      "SELECT payload FROM outbox_events WHERE kind='review.invitation' ORDER BY created_at DESC LIMIT 1"
    )
  ).rows[0].payload.reviewUrl;
  assert.ok(url.includes('/review/'));
  const token = url.split('#review=')[1];
  const guestSession = (
    await pool.query(
      'INSERT INTO commerce_sessions(restaurant_id,token_hash) VALUES($1,$2) RETURNING id',
      [f.a.id, randomUUID()]
    )
  ).rows[0];
  const diner = { restaurantId: f.a.id, sessionId: guestSession.id };
  await assert.rejects(core.customerOrder(diner, order.id), /not found/);
  const review = await withTransaction((c) =>
    reviews.submitReview(c, diner, order.id, {
      rating: 4,
      comment: 'Verified counter visit',
      token,
    })
  );
  assert.deepEqual(Object.keys(review).sort(), ['comment', 'id', 'rating']);
  await pool.query("UPDATE restaurant_memberships SET status='revoked' WHERE id=$1", [member]);
  await assert.rejects(core.submitOrder(scope, key, input), /access or action permission/);
  await assert.rejects(core.customerOrder(scope, order.id), /not found/);
});

test('Phase 4 full discounts settle zero balances without fabricating drawer cash', async () => {
  const f = await setup();
  const settings = (
    await pool.query('SELECT content FROM commerce_settings WHERE restaurant_id=$1', [f.a.id])
  ).rows[0].content;
  await pool.query(
    'UPDATE commerce_settings SET content=$2,version=version+1 WHERE restaurant_id=$1',
    [f.a.id, { ...settings, serviceCharge: 0 }]
  );
  await f.op(async (c, a) => {
    const content = (await q(c, 'settingsGet', [a.restaurantId]))[0].content;
    await q(c, 'settingsSave', [a.restaurantId, { ...content, cash: true }]);
    const rule = {
      code: 'FULL',
      kind: 'percent',
      value: 10000,
      minimum: 0,
      maximum: 0,
      startsAt: new Date(Date.now() - 60000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
      limit: 5,
      perCustomer: 0,
      itemIds: [],
      categoryIds: [],
      modes: ['pickup'],
      active: true,
    };
    await q(c, 'coupon', [...args(a), rule.code, rule]);
  });
  const order = await f.submitted(f.a.scope, { coupon: 'FULL' });
  await f.status(order.id, 'CONFIRMED');
  const register = await f.op(
    async (c, a) => (await q(c, 'register', [...args(a), 'Zero drawer']))[0]
  );
  const session = await f.op((c, a) =>
    cash.openCash(c, a, { registerId: register.id, opening: 1000 })
  );
  const result = await f.op((c, a) =>
    cash.cashAction(c, a, session.id, {
      action: 'SALE',
      orderId: order.id,
      key: 'zero:' + order.id,
      reason: 'Fully discounted order',
    })
  );
  assert.equal(result.cashCollected, 0);
  assert.equal(
    (await pool.query('SELECT amount FROM payment_transactions WHERE order_id=$1', [order.id]))
      .rows[0].amount,
    '0'
  );
  assert.equal(
    (await pool.query('SELECT * FROM cash_movements WHERE cash_session_id=$1', [session.id])).rows
      .length,
    0
  );
  assert.equal(
    (await pool.query('SELECT payment_status FROM orders WHERE id=$1', [order.id])).rows[0]
      .payment_status,
    'PAID'
  );
});

test('Phase 4 partial item refunds allocate original discounts and tax exactly after coupon edits', async () => {
  const f = await setup();
  const { lineRefund } = await import('../../src/modules/operations/refunds.service.js');
  const rule = {
    code: 'ALLOCATE',
    kind: 'percent',
    value: 1000,
    minimum: 0,
    maximum: 0,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    limit: 10,
    perCustomer: 0,
    itemIds: [],
    categoryIds: [],
    modes: ['pickup'],
    active: true,
  };
  await f.op((c, a) => q(c, 'coupon', [...args(a), rule.code, rule]));
  const order = await f.submitted(f.a.scope, { coupon: rule.code });
  await f.status(order.id, 'CONFIRMED');
  const o = (await pool.query('SELECT * FROM orders WHERE id=$1', [order.id])).rows[0];
  assert.equal(o.total, '2560');
  await core.collect(f.a.id, o.id, o.version, f.owner.id);
  await f.op((c, a) => q(c, 'coupon', [...args(a), rule.code, { ...rule, value: 9000 }]));
  const line = (await pool.query('SELECT * FROM order_items WHERE order_id=$1', [order.id]))
    .rows[0];
  const input = {
    orderId: order.id,
    lines: [{ orderItemId: line.id, quantity: 1 }],
    reason: 'Original allocated item refund',
  };
  const results = await Promise.all([
    f.op((c, a) => lineRefund(c, a, input)),
    f.op((c, a) => lineRefund(c, a, input)),
  ]);
  assert.deepEqual(
    results.map((r) => Number(r.amount)).sort((a, b) => a - b),
    [1267, 1268]
  );
  assert.equal(
    results.reduce((n, r) => n + Number(r.amount), 0),
    2535
  );
  await assert.rejects(
    f.op((c, a) => lineRefund(c, a, input)),
    /remaining original order line/
  );
  await assert.rejects(pool.query('UPDATE refund_line_allocations SET amount=0'), /Append-only/);
});
