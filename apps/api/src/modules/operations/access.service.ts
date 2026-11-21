import type { PoolClient } from 'pg';
import { q } from './operations.repository.js';
import { business } from '../commerce/commerce.service.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error.js';
export type Context = {
  restaurantId: string;
  branchId: string;
  userId: string;
  membershipId: string;
  permissions: string[];
  roles: string[];
};
export async function access(
  c: PoolClient,
  id: string,
  branch: string,
  user: string,
  permission: string
) {
  await q(c, 'lock', [id]);
  const a = (await q(c, 'access', [id, branch, user]))[0];
  if (!a || (permission && !a.permissions?.includes(permission)))
    throw new ForbiddenError('Branch access or action permission denied');
  const defaultBranch = (await q(c, 'defaultBranch', [id]))[0];
  if (defaultBranch?.id !== branch)
    throw new ForbiddenError('Only the default branch is enabled for Phase 4');
  return {
    restaurantId: id,
    branchId: branch,
    userId: user,
    membershipId: a.id,
    permissions: a.permissions ?? [],
    roles: a.roles ?? [],
  } as Context;
}
export const args = (a: Context) => [a.restaurantId, a.branchId];
export async function enabled(
  c: PoolClient,
  a: Pick<Context, 'restaurantId' | 'branchId'>,
  feature?: string
) {
  const b = await business(c, a.restaurantId, 'ordering');
  if (b.branch_id !== a.branchId) throw new ForbiddenError('Branch mismatch');
  await q(c, 'settings', [a.restaurantId]);
  const settings = (await q(c, 'settingsGet', [a.restaurantId]))[0].content;
  if (feature && !settings[feature])
    throw new ForbiddenError(`${feature} is disabled; complete setup first`);
  return { b, settings };
}
export async function audit(
  c: PoolClient,
  a: Context,
  entity: string,
  id: string,
  action: string,
  reason: string,
  content: unknown = {}
) {
  await q(c, 'audit', [...args(a), entity, id, action, a.userId, reason, content]);
}
export function found<T>(v: T | undefined): T {
  if (!v) throw new NotFoundError('Record not found in this branch');
  return v;
}
