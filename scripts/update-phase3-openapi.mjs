import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import * as c from '../packages/contracts/dist/index.js';
const file = new URL('../docs/openapi.json', import.meta.url),
  doc = JSON.parse(await readFile(file, 'utf8'));
doc.info.title = 'ZAYQORA Phase 3';
doc.info.version = '3.0.0';
for (const [name, schema] of Object.entries({
  CommerceSettings: c.commerceSettingsSchema,
  CartLine: c.cartLineSchema,
  Contact: c.contactSchema,
  SubmitOrder: c.submitOrderSchema,
  ReservationRequest: c.reservationRequestSchema,
}))
  doc.components.schemas[name] = z.toJSONSchema(schema);
const ref = (n) => ({ $ref: '#/components/schemas/' + n });
const integer = { type: 'integer', minimum: 0 },
  uuid = { type: 'string', format: 'uuid' },
  stamp = { type: 'string', format: 'date-time' };
doc.components.securitySchemes.guestSession = {
  type: 'apiKey',
  in: 'cookie',
  name: 'zq_guest_<restaurant UUID without hyphens>',
  description:
    'Dynamic per-restaurant signed HttpOnly cookie issued by GET /commerce/{restaurantId}/session. Cart/order/reservation IDs alone grant no access. Expires in 30 days. Never send in a URL.',
};
doc.components.securitySchemes.guestCsrf = {
  type: 'apiKey',
  in: 'header',
  name: 'X-Guest-CSRF',
  description:
    'Session-bound HMAC returned by GET /commerce/{restaurantId}/session; required for guest and authenticated commerce mutations. Existing account sessions ALSO require X-CSRF-Token.',
};
doc.components.schemas.Cart = {
  type: 'object',
  properties: {
    id: uuid,
    version: integer,
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ...c.cartLineSchema.shape, unit: integer, lineTotal: integer },
      },
    },
    issues: {
      type: 'array',
      items: { type: 'object', properties: { id: uuid, message: { type: 'string' } } },
    },
  },
};
// JSON-compatible snapshot shapes; inputs never accept these authoritative amounts.
doc.components.schemas.Cart.properties.lines.items = {
  type: 'object',
  properties: {
    id: uuid,
    itemId: uuid,
    name: { type: 'string' },
    quantity: integer,
    unit: integer,
    lineTotal: integer,
    currency: { type: 'string' },
    revision: uuid,
    variant: { type: ['object', 'null'] },
    modifiers: { type: 'array', items: { type: 'object' } },
  },
};
doc.components.schemas.Quote = {
  type: 'object',
  properties: {
    id: uuid,
    cart_id: uuid,
    cart_version: integer,
    settings_version: integer,
    revision_id: uuid,
    expires_at: stamp,
    content: {
      type: 'object',
      properties: {
        currency: { type: 'string' },
        subtotal: integer,
        tax: integer,
        serviceCharge: integer,
        deliveryFee: integer,
        total: integer,
        lines: doc.components.schemas.Cart.properties.lines,
        warnings: { type: 'array', items: { type: 'string' } },
        fulfillment: { const: 'pickup' },
        leadMinutes: integer,
      },
    },
  },
};
doc.components.schemas.Order = {
  type: 'object',
  properties: {
    id: uuid,
    restaurantId: uuid,
    reference: { type: 'string' },
    status: { type: 'string', enum: c.orderStates },
    paymentStatus: { type: 'string', enum: ['UNPAID', 'PENDING', 'UNKNOWN', 'PAID', 'FAILED'] },
    method: { enum: ['pay_at_pickup', 'test_online'] },
    currency: { type: 'string' },
    total: integer,
    snapshot: doc.components.schemas.Quote.properties.content,
    contact: ref('Contact'),
    version: integer,
    cancellationRequested: { type: 'boolean' },
    history: { type: 'array', items: { type: 'object' } },
    refunds: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: uuid,
          amount: { type: 'string', description: 'PostgreSQL bigint minor units' },
          status: { enum: ['PENDING', 'CONFIRMED', 'FAILED'] },
        },
      },
    },
  },
};
doc.components.schemas.Reservation = {
  type: 'object',
  properties: {
    id: uuid,
    reference: { type: 'string' },
    status: { enum: c.reservationStates },
    start: stamp,
    end: stamp,
    party: integer,
    version: integer,
    contact: ref('Contact'),
    holdExpiresAt: stamp,
  },
};
const json = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const object = (properties) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
function route(path, method, summary, body, response = { type: 'object' }, kind = 'guest') {
  const isMutation = !['get', 'head'].includes(method);
  const params = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    in: 'path',
    name: m[1],
    required: true,
    schema: uuid,
  }));
  const security =
    kind === 'guest'
      ? [isMutation ? { guestSession: [], guestCsrf: [] } : { guestSession: [] }]
      : [{ session: [] }];
  doc.paths[path] ??= {};
  doc.paths[path][method] = {
    summary,
    tags: ['Phase 3'],
    description: `${kind === 'guest' ? 'Guest credential scoped to this restaurant or verified account ownership. Initialize the guest session first. Never link historical orders by email.' : kind === 'platform' ? 'Verified separate platform administrator assignment.' : 'Verified active tenant membership with the operation-specific permission. Resolution routes remain accessible during suspension.'} No shared caching. Existing cookie sessions require X-CSRF-Token on mutations. Rate limit: 300 requests / 15 minutes / IP per API process (test environment raises limits). Business conflicts are 409; quote conflicts include details.quote and require explicit reconfirmation. Network uncertainty must reuse the original operation identity.`,
    security,
    parameters: params,
    ...(body ? { requestBody: body } : {}),
    responses: {
      200: { description: 'Success', content: { 'application/json': { schema: response } } },
      201: { description: 'Created', content: { 'application/json': { schema: response } } },
      400: { description: 'Invalid fields, configuration, amounts, date or contact' },
      401: { description: 'Account session required' },
      403: {
        description: 'Credential, permission, CSRF, entitlement or business-mode restriction',
      },
      404: { description: 'Scoped record not found' },
      409: { description: 'Version/state/idempotency/quote/capacity conflict' },
      429: { description: 'Rate limited; retry per response headers' },
    },
  };
  return doc.paths[path][method];
}
const root = '/commerce/{restaurantId}',
  ops = '/operations/{restaurantId}';
const session = route(
  root + '/session',
  'get',
  'Initialize or restore a signed restaurant guest credential',
  undefined,
  {
    type: 'object',
    properties: {
      csrf: { type: 'string' },
      restaurantId: uuid,
      name: { type: 'string' },
      ordering: { type: 'boolean' },
      reservations: { type: 'boolean' },
      payAtPickup: { type: 'boolean' },
      onlinePayment: { const: false },
    },
  }
);
session.security = [];
route(
  root + '/cart',
  'get',
  'Retrieve/restore the scoped cart, including invalid-line explanations',
  undefined,
  ref('Cart')
);
route(
  root + '/cart',
  'patch',
  'Add/change/remove/clear cart lines with expected version',
  json({
    type: 'object',
    required: ['version'],
    additionalProperties: false,
    properties: {
      version: integer,
      line: ref('CartLine'),
      removeId: uuid,
      clear: { type: 'boolean' },
    },
    description: 'Exactly one line, removeId or clear:true operation is required.',
  }),
  ref('Cart')
);
route(
  root + '/quotes',
  'post',
  'Create a five-minute authoritative pickup quote',
  undefined,
  ref('Quote')
);
const submit = route(
  root + '/orders',
  'post',
  'Create an order safely or recover the same checkout operation',
  json(ref('SubmitOrder')),
  ref('Order')
);
submit.parameters.push({
  in: 'header',
  name: 'Idempotency-Key',
  required: true,
  schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,128}$' },
});
submit.description +=
  ' Key scope is order + tenant + verified account or guest session; identical payload returns the original result, a changed fingerprint conflicts. test_online is accepted ONLY in NODE_ENV=test.';
route(
  root + '/orders',
  'get',
  'List this browser/account’s restaurant orders (latest 100)',
  undefined,
  { type: 'array', items: ref('Order') }
);
route(
  root + '/orders/{orderId}',
  'get',
  'Read customer-safe order milestones and refund state',
  undefined,
  ref('Order')
);
route(
  root + '/orders/{orderId}/cancellation',
  'post',
  'Cancel pending order or request staff review after acceptance'
);
route(
  root + '/orders/{orderId}/payment',
  'post',
  'Request reconciliation of the existing test-only online identity; no new payment identity'
);
route(
  root + '/reservations/availability',
  'get',
  'Advisory cover availability with explicit UTC instants and local offset labels'
).parameters.push(
  { in: 'query', name: 'date', required: true, schema: { type: 'string', format: 'date' } },
  {
    in: 'query',
    name: 'party',
    required: true,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  }
);
route(
  root + '/reservations',
  'post',
  'Request staff-confirmed reservation with transactional overlap capacity checking',
  json(ref('ReservationRequest')),
  ref('Reservation')
);
route(root + '/reservations', 'get', 'List scoped reservation history (latest 100)', undefined, {
  type: 'array',
  items: ref('Reservation'),
});
const reservationUpdate = {
  type: 'object',
  required: ['version', 'reason'],
  properties: {
    version: integer,
    status: { enum: c.reservationStates },
    start: stamp,
    reason: { type: 'string', minLength: 3, maxLength: 500 },
  },
  description:
    'Exactly one status or new UTC start. Customers may cancel or atomically reschedule pending/confirmed future records; staff have explicit additional transitions.',
};
route(
  root + '/reservations/{reservationId}',
  'patch',
  'Manage own reservation or atomically reschedule',
  json(reservationUpdate)
);
const profile = object({
  name: { type: 'string', minLength: 2, maxLength: 100 },
  phone: { type: 'string', maxLength: 30 },
  transactionalEmail: { type: 'boolean' },
  marketingConsent: { type: 'boolean' },
  addresses: {
    type: 'array',
    maxItems: 10,
    items: object({
      label: { type: 'string', maxLength: 50 },
      address: { type: 'string', maxLength: 255 },
    }),
  },
});
route(
  root + '/profile',
  'get',
  'Read tenant-specific account profile/preferences; verified login required',
  undefined,
  profile
);
route(
  root + '/profile',
  'patch',
  'Update own profile, addresses and separate marketing consent; verified login required',
  json(profile),
  profile
);
route(root + '/notifications', 'get', 'Read deduplicated in-app business updates');
route(
  '/customer/history',
  'get',
  'Read verified account history across restaurants; never claim guest records by email',
  undefined,
  {
    type: 'object',
    properties: {
      orders: { type: 'array', items: ref('Order') },
      reservations: { type: 'array', items: ref('Reservation') },
    },
  },
  'account'
);
route(
  ops + '/settings',
  'get',
  'Read business settings and plan entitlements; restaurant:update',
  undefined,
  undefined,
  'staff'
);
route(
  ops + '/settings',
  'patch',
  'Update versioned operational configuration; restaurant:update',
  json(object({ version: integer, settings: ref('CommerceSettings') })),
  undefined,
  'staff'
);
const list = route(
  ops + '/orders',
  'get',
  'Paginated tenant order list; orders:read',
  undefined,
  { type: 'array', items: ref('Order') },
  'staff'
);
list.parameters.push(
  ...[
    { name: 'offset', schema: integer },
    { name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 } },
    { name: 'status', schema: { enum: c.orderStates } },
    { name: 'payment', schema: { enum: ['UNPAID', 'PENDING', 'UNKNOWN', 'PAID', 'FAILED'] } },
    { name: 'reference', schema: { type: 'string', pattern: '^[A-Z0-9-]{1,20}$' } },
    { name: 'from', schema: { type: 'string', format: 'date' } },
    { name: 'to', schema: { type: 'string', format: 'date' } },
  ].map((v) => ({ in: 'query', ...v }))
);
route(
  ops + '/orders/{orderId}',
  'get',
  'Read tenant order details/audit/refund/reconciliation state; orders:read',
  undefined,
  ref('Order'),
  'staff'
);
route(
  ops + '/orders/{orderId}',
  'patch',
  'Transition fulfillment with optimistic version; orders:process plus orders:cancel for rejection/cancellation',
  json({
    type: 'object',
    required: ['version', 'status', 'reason'],
    properties: {
      version: integer,
      status: { enum: c.orderStates },
      reason: { type: 'string', minLength: 3, maxLength: 500 },
      preparationMinutes: { type: 'integer', minimum: 0, maximum: 180 },
    },
  }),
  undefined,
  'staff'
);
route(
  ops + '/orders/{orderId}/collection',
  'post',
  'Audited pay-at-pickup collection only; payments:manage',
  json(object({ version: integer })),
  undefined,
  'staff'
);
route(
  ops + '/orders/{orderId}/refunds',
  'post',
  'Reserve a refund amount under order lock; payments:manage',
  json(
    object({
      amount: { type: 'integer', minimum: 1, maximum: 100000000 },
      reason: { type: 'string', minLength: 3 },
    })
  ),
  undefined,
  'staff'
);
route(
  ops + '/refunds/{refundId}/confirmation',
  'post',
  'Explicitly record returned pickup funds; payments:manage',
  undefined,
  undefined,
  'staff'
);
route(
  ops + '/reservations',
  'get',
  'Reservation calendar list, 50 records; reservations:manage',
  undefined,
  { type: 'array', items: ref('Reservation') },
  'staff'
).parameters.push({ in: 'query', name: 'offset', schema: integer });
route(
  ops + '/reservations/{reservationId}',
  'patch',
  'Versioned confirmation/decline/cancel/seat/complete/no-show/reschedule; reservations:manage',
  json(reservationUpdate),
  undefined,
  'staff'
);
route(
  ops + '/reports',
  'get',
  'Currency-separated operational and cash collection reports; reports:read',
  undefined,
  undefined,
  'staff'
).parameters.push(
  ...['from', 'to'].map((name) => ({
    in: 'query',
    name,
    required: true,
    schema: { type: 'string', format: 'date' },
  }))
);
route(
  ops + '/notifications/jobs',
  'get',
  'Outbox backlog/failure visibility (latest 100); restaurant:update',
  undefined,
  undefined,
  'staff'
);
route(
  ops + '/notifications/jobs/{jobId}/retry',
  'post',
  'Explicit failed-job retry preserving delivery history; restaurant:update',
  undefined,
  undefined,
  'staff'
);
route(
  '/platform/tenants',
  'get',
  'List tenants (50 records) and manually managed plans',
  undefined,
  undefined,
  'platform'
).parameters.push({ in: 'query', name: 'offset', schema: integer });
route(
  '/platform/plans',
  'get',
  'List basic and controlled-pilot plan definitions',
  undefined,
  undefined,
  'platform'
);
route(
  '/platform/tenants/{restaurantId}',
  'get',
  'Tenant settings/entitlements and platform audit history',
  undefined,
  undefined,
  'platform'
);
route(
  '/platform/tenants/{restaurantId}',
  'patch',
  'Activate/suspend/reactivate or assign plan/trial with mandatory reason',
  json({
    type: 'object',
    required: ['reason'],
    properties: {
      status: { enum: ['active', 'suspended', 'onboarding'] },
      plan: { enum: ['basic', 'pilot'] },
      subscriptionStatus: { enum: ['manual', 'trial', 'inactive'] },
      trialEndsAt: stamp,
      reason: { type: 'string', minLength: 3, maxLength: 500 },
    },
  }),
  undefined,
  'platform'
);
const hook = route(
  '/test/payment-webhook',
  'post',
  'TEST ONLY: signed deterministic provider-event simulator',
  json(
    object({
      eventId: { type: 'string' },
      reference: { type: 'string' },
      merchant: uuid,
      amount: integer,
      currency: { type: 'string' },
      status: { enum: ['PENDING', 'PAID', 'FAILED'] },
    })
  )
);
hook.security = [];
hook.description =
  'Registered ONLY when NODE_ENV=test, absent in development and production. Raw JSON bytes are HMAC-SHA256 signed as timestamp + dot + raw body using the test COOKIE_SECRET. Five-minute timestamp tolerance. Merchant/ref/amount/currency checked; events deduplicated durably. Not a real provider integration.';
hook.parameters.push(
  { in: 'header', name: 'X-Test-Signature', required: true, schema: { type: 'string' } },
  { in: 'header', name: 'X-Test-Timestamp', required: true, schema: { type: 'string' } }
);
route(
  '/platform/operations/health',
  'get',
  'Read outbox/payment/expiration monitoring counters; platform administrator only',
  undefined,
  undefined,
  'platform'
);
route(
  ops + '/orders/{orderId}/cancellation-resolution',
  'post',
  'Explicitly approve/decline an accepted-order cancellation request; orders:cancel',
  json(
    object({
      version: integer,
      decision: { enum: ['approve', 'decline'] },
      reason: { type: 'string', minLength: 3, maxLength: 500 },
    })
  ),
  undefined,
  'staff'
);
await writeFile(file, JSON.stringify(doc, null, 2) + '\n');
