import type { PoolClient } from 'pg';
import { checkoutAmounts } from '@zayqora/contracts';
import { ConflictError, ForbiddenError, ValidationError } from '../../shared/errors/app-error.js';
import { q } from './operations.repository.js';
import { enabled, found } from './access.service.js';
export async function operationalPricing(
  c: PoolClient,
  b: any,
  scope: any,
  lines: any[],
  context: any
) {
  const amounts = checkoutAmounts(
    lines.reduce((n, l) => n + l.lineTotal, 0),
    b.settings.taxBps,
    b.settings.serviceCharge
  );
  let deliveryFee = 0;
  let coupon: any = null;
  let discount = 0;
  if (context.mode === 'delivery') {
    await enabled(c, { restaurantId: b.id, branchId: b.branch_id }, 'delivery');
    const zone = found((await q(c, 'zoneGet', [b.id, b.branch_id, context.zoneId]))[0]);
    if (!context.address) throw new ValidationError('Delivery address required');
    deliveryFee = Number(zone.fee);
  }
  if (context.coupon) {
    await enabled(c, { restaurantId: b.id, branchId: b.branch_id }, 'coupons');
    coupon = found((await q(c, 'couponGet', [b.id, b.branch_id, context.coupon.toUpperCase()]))[0]);
    const r = coupon.content;
    if (
      !r.active ||
      new Date(r.startsAt) > new Date() ||
      new Date(r.endsAt) <= new Date() ||
      !r.modes.includes(context.mode)
    )
      throw new ConflictError('Coupon expired or unavailable for this service mode');
    if (r.perCustomer && context.channel === 'pos')
      throw new ForbiddenError(
        'Per-customer coupons require the customer’s own authenticated checkout'
      );
    if (
      r.perCustomer &&
      (!scope.userId || !(await q(c, 'verified', [scope.userId]))[0]?.is_email_verified)
    )
      throw new ForbiddenError('This coupon requires a verified customer account');
    const eligible = lines.filter(
      (l) =>
        (!r.itemIds.length && !r.categoryIds.length) ||
        r.itemIds.includes(l.itemId) ||
        r.categoryIds.includes(b.content.items.find((i: any) => i.id === l.itemId)?.categoryId)
    );
    const subtotal = eligible.reduce((n, l) => n + l.lineTotal, 0);
    if (subtotal < r.minimum || !subtotal)
      throw new ConflictError('Coupon minimum eligible spend not met');
    discount =
      r.kind === 'percent'
        ? Number((BigInt(subtotal) * BigInt(r.value) + 5000n) / 10000n)
        : r.kind === 'fixed'
          ? r.value
          : 0;
    discount = Math.min(discount, subtotal, r.maximum || subtotal);
    if (r.kind === 'free_delivery') {
      if (context.mode !== 'delivery') throw new ConflictError('Free delivery requires delivery');
      deliveryFee = 0;
    }
    let remaining = discount,
      eligibleRemaining = subtotal;
    for (const l of lines) {
      l.discount = 0;
      if (eligible.includes(l)) {
        const d =
          eligibleRemaining === l.lineTotal
            ? remaining
            : Number((BigInt(remaining) * BigInt(l.lineTotal)) / BigInt(eligibleRemaining));
        l.discount = d;
        remaining -= d;
        eligibleRemaining -= l.lineTotal;
      }
      l.discountedTotal = l.lineTotal - l.discount;
    }
    const count = (await q(c, 'couponCount', [coupon.id, scope.userId ?? null]))[0];
    if (count.total >= r.limit || (r.perCustomer && count.personal >= r.perCustomer))
      throw new ConflictError('Coupon redemption limit reached');
  }
  const discounted = checkoutAmounts(
    amounts.subtotal - discount,
    b.settings.taxBps,
    b.settings.serviceCharge
  );
  return {
    ...discounted,
    subtotal: amounts.subtotal,
    discount,
    deliveryFee,
    total: discounted.total + deliveryFee,
    coupon: coupon ? { id: coupon.id, code: coupon.code, version: coupon.version, discount } : null,
  };
}
export async function reserveCoupon(c: PoolClient, o: any) {
  const coupon = o.snapshot.coupon;
  if (!coupon) return;
  // Restaurant lock serializes checkout, then row lock validates capacity against immutable quote.
  const row = found((await q(c, 'couponGet', [o.restaurant_id, o.branch_id, coupon.code]))[0]);
  if (
    row.content.perCustomer &&
    (!o.user_id || !(await q(c, 'verified', [o.user_id]))[0]?.is_email_verified)
  )
    throw new ForbiddenError('A verified customer identity is required');
  const n = (await q(c, 'couponCount', [row.id, o.user_id]))[0];
  if (
    row.version !== coupon.version ||
    n.total >= row.content.limit ||
    (row.content.perCustomer && n.personal >= row.content.perCustomer)
  )
    throw new ConflictError('Coupon changed or capacity exhausted. Refresh quote.');
  await q(c, 'couponUse', [o.restaurant_id, o.branch_id, row.id, o.id, o.user_id, coupon]);
}
