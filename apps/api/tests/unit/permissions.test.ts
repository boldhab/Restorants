import { it } from 'node:test';
import assert from 'node:assert/strict';
import { authorize, requirePlatformAdmin } from '../../src/middleware/authorize.js';
import { createRestaurantSchema, passwordSchema } from '@zayqora/contracts';
it('requires explicit tenant permission even when a role is named owner', () => {
  let error: any;
  authorize('restaurant:update')(
    { tenantContext: { roles: ['owner'], permissions: [] } },
    null,
    (e) => {
      error = e;
    }
  );
  assert.equal(error.statusCode, 403);
});
it('restaurant ownership alone never authorizes platform administration', () => {
  let error: any;
  requirePlatformAdmin(
    { user: { is_platform_admin: false }, tenantContext: { roles: ['owner'] } },
    null,
    (e) => {
      error = e;
    }
  );
  assert.equal(error.statusCode, 403);
});
it('rejects invalid IANA timezones and bcrypt byte truncation', () => {
  assert.equal(createRestaurantSchema.shape.timezone.safeParse('Mars/Olympus').success, false);
  assert.equal(passwordSchema.safeParse('é'.repeat(40)).success, false);
});
