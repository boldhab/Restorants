import type { PoolClient } from 'pg';
import { operationalOrderContext } from '@zayqora/contracts';
import type { Scope } from '../commerce/commerce.service.js';
import { ForbiddenError, ConflictError } from '../../shared/errors/app-error.js';
import { hashToken } from '../../shared/security/tokens.js';
import { q } from './operations.repository.js';
import { access, enabled, found } from './access.service.js';
export async function validateOrderContext(c: PoolClient, scope: Scope, b: any, raw: any) {
  const context = operationalOrderContext.parse(raw ?? {});
  if (context.channel === 'pos') {
    if (!scope.userId) throw new ForbiddenError('Staff account required');
    const a = await access(c, scope.restaurantId, b.branch_id, scope.userId, 'pos.create');
    await enabled(c, a, 'pos');
  }
  if (context.customerId) {
    if (
      context.channel !== 'pos' ||
      !(await q(c, 'posCustomer', [b.id, b.branch_id, context.customerId])).length
    )
      throw new ForbiddenError('Choose a verified existing customer from this branch');
  }
  if (context.channel === 'qr') {
    const grant = (
      await q(c, 'guestAccess', [
        scope.restaurantId,
        scope.sessionId,
        hashToken(scope.tableToken ?? ''),
      ])
    )[0];
    if (!grant || grant.service_session_id !== context.serviceSessionId)
      throw new ForbiddenError('Current diner activation required');
    if (context.mode !== 'dine_in') throw new ForbiddenError('Table QR supports dine-in only');
  }
  if (context.mode === 'dine_in') {
    if (!['pos', 'qr'].includes(context.channel))
      throw new ForbiddenError('Dine-in requires staff or a table activation');
    await enabled(c, { restaurantId: scope.restaurantId, branchId: b.branch_id }, 'tables');
    const visit = found(
      (await q(c, 'visitGet', [scope.restaurantId, b.branch_id, context.serviceSessionId]))[0]
    );
    if (visit.status !== 'OPEN') throw new ConflictError('Visit closed');
  } else if (context.serviceSessionId)
    throw new ForbiddenError('Only dine-in orders may link a table');
  return context;
}
