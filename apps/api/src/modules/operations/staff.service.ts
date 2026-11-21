import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { hashToken } from '../../shared/security/tokens.js';
import { ForbiddenError, ConflictError } from '../../shared/errors/app-error.js';
import { env } from '../../config/env.js';
import { event } from '../commerce/commerce.service.js';
import { q } from './operations.repository.js';
import { args, audit, enabled, found, type Context } from './access.service.js';
export async function mayGrant(c: PoolClient, a: Context, role: string) {
  if (role === 'owner' && !a.roles.includes('owner'))
    throw new ForbiddenError('Only owners may assign ownership');
  const permissions = (await q(c, 'rolePermissions', [role])).map((p) => p.code);
  if (
    (!a.roles.includes('owner') && permissions.includes('staff.manage')) ||
    permissions.some((p) => !a.permissions.includes(p))
  )
    throw new ForbiddenError('Role exceeds your management scope');
}
export async function invite(c: PoolClient, a: Context, input: any) {
  await enabled(c, a);
  await mayGrant(c, a, input.role);
  if (input.branchId !== a.branchId)
    throw new ForbiddenError('Invitation branch differs from your authorized branch');
  const token = randomBytes(32).toString('base64url');
  const r = (
    await q(c, 'invite', [
      ...args(a),
      input.email.toLowerCase(),
      input.role,
      hashToken(token),
      a.userId,
    ])
  )[0];
  await event(
    c,
    a.restaurantId,
    'staff.invitation',
    r.id,
    { email: input.email },
    { invitationUrl: `${env.APP_URL}/staff-invitation#${token}` }
  );
  await audit(c, a, 'invitation', r.id, 'INVITED', 'Staff invitation', {
    email: input.email,
    role: input.role,
  });
  return r;
}
export async function accept(
  c: PoolClient,
  token: string,
  user: { id: string; email: string; is_email_verified: boolean }
) {
  // Read token first without holding its lock, then serialize all effects under the tenant lock.
  const initial = found((await q(c, 'inviteFind', [hashToken(token)]))[0]);
  await q(c, 'lock', [initial.restaurant_id]);
  const r = found((await q(c, 'inviteGet', [hashToken(token)]))[0]);
  if (r.consumed_at || r.revoked_at || new Date(r.expires_at) <= new Date())
    throw new ConflictError('Invitation expired, revoked or already accepted');
  if (!user.is_email_verified || user.email.toLowerCase() !== r.email.toLowerCase())
    throw new ForbiddenError('Use the verified account matching this invitation');
  const inviter = (await q(c, 'access', [r.restaurant_id, r.branch_id, r.invited_by]))[0];
  if (!inviter?.permissions?.includes('staff.manage'))
    throw new ForbiddenError('Inviter no longer authorized');
  const a: Context = {
    restaurantId: r.restaurant_id,
    branchId: r.branch_id,
    userId: r.invited_by,
    membershipId: inviter.id,
    permissions: inviter.permissions,
    roles: inviter.roles,
  };
  await enabled(c, a);
  await mayGrant(c, a, r.role);
  let m = (await q(c, 'memberUser', [...args(a), user.id]))[0];
  if (m) throw new ConflictError('Existing member: an owner must change their role explicitly');
  m = (await q(c, 'membership', [r.restaurant_id, user.id]))[0];
  // Re-activation must replace stale prior privileges.
  await q(c, 'deleteRoles', [m.id]);
  await q(c, 'grantRole', [m.id, r.role]);
  await q(c, 'grantBranch', [r.restaurant_id, r.branch_id, m.id]);
  await q(c, 'inviteConsume', [r.id]);
  await audit(c, { ...a, userId: user.id }, 'membership', m.id, 'ACCEPTED', 'Invitation accepted');
  return { restaurantId: r.restaurant_id, branchId: r.branch_id };
}
export async function changeMember(
  c: PoolClient,
  a: Context,
  id: string,
  input: { role: string; active: boolean; reason: string }
) {
  if (input.active) await enabled(c, a);
  await mayGrant(c, a, input.role);
  const m = found((await q(c, 'memberGet', [a.restaurantId, id]))[0]);
  if (m.roles.includes('owner') && !a.roles.includes('owner'))
    throw new ForbiddenError('Only an owner may change another owner');
  if (
    m.status === 'active' &&
    m.roles.includes('owner') &&
    (!input.active || input.role !== 'owner') &&
    Number((await q(c, 'owners', [a.restaurantId]))[0].n) <= 1
  )
    throw new ConflictError('The final active owner must remain');
  await q(c, 'memberStatus', [a.restaurantId, id, input.active ? 'active' : 'revoked']);
  await q(c, 'deleteRoles', [id]);
  await q(c, 'grantRole', [id, input.role]);
  if (input.active) await q(c, 'grantBranch', [...args(a), id]);
  await audit(c, a, 'membership', id, 'CHANGED', input.reason, input);
  return { updated: true };
}
