import type { PoolClient } from 'pg';
import { reserveRefund } from '../commerce/commerce.service.js';
import { ConflictError } from '../../shared/errors/app-error.js';
import { q } from './operations.repository.js';
import { args, audit, found, type Context } from './access.service.js';
/** Allocate the original tax once across discounted lines, then exact prefix shares across units. */
export function refundableLines(items: any[], snapshot: any) {
  const net = items.map((i) => Number(i.snapshot.discountedTotal ?? i.snapshot.lineTotal));
  let remainingTax = BigInt(snapshot.tax ?? 0),
    remainingNet = BigInt(net.reduce((a, b) => a + b, 0));
  return items.map((item, index) => {
    const value = BigInt(net[index]);
    const tax =
      remainingNet === 0n
        ? 0n
        : remainingNet === value
          ? remainingTax
          : (remainingTax * value) / remainingNet;
    remainingTax -= tax;
    remainingNet -= value;
    return { id: item.id, quantity: item.snapshot.quantity, gross: value + tax };
  });
}
export async function lineRefund(c: PoolClient, a: Context, input: any) {
  const o = found((await q(c, 'order', [a.restaurantId, input.orderId]))[0]);
  if (o.branch_id !== a.branchId || o.payment_status !== 'PAID')
    throw new ConflictError('Choose a collected order in this branch');
  const items = await q(c, 'items', [a.restaurantId, o.id]);
  const refundable = refundableLines(items, o.snapshot);
  let amount = 0;
  const allocations = [];
  for (const claim of input.lines) {
    const line = found(refundable.find((l) => l.id === claim.orderItemId));
    const used = Number((await q(c, 'refundedQuantity', [a.restaurantId, line.id]))[0].n);
    if (used + claim.quantity > line.quantity)
      throw new ConflictError('Refund quantity exceeds the remaining original order line');
    const value = Number(
      (line.gross * BigInt(used + claim.quantity)) / BigInt(line.quantity) -
        (line.gross * BigInt(used)) / BigInt(line.quantity)
    );
    amount += value;
    allocations.push({ ...claim, amount: value });
  }
  if (amount <= 0)
    throw new ConflictError('These discounted items have no remaining refundable amount');
  const refund = await reserveRefund(c, a.restaurantId, o.id, amount, a.userId, input.reason);
  for (const l of allocations)
    await q(c, 'refundLine', [...args(a), o.id, l.orderItemId, refund.id, l.quantity, l.amount]);
  await audit(c, a, 'refund', refund.id, 'LINE_ALLOCATION', input.reason, {
    allocations,
    amount,
    policy:
      'Original discounted line total plus original allocated tax; fixed service/delivery excluded',
  });
  return { ...refund, allocations };
}
