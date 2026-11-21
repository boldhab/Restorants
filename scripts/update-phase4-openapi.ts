import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { operationalApiDefinitions } from '../apps/api/src/modules/operations/operations.routes.js';
import {
  operationalOrderContext,
  operationSettingsSchema,
  invitationSchema,
  recipeSchema,
  couponSchema,
} from '@zayqora/contracts';
import { pool } from '../apps/api/src/database/pool.js';
const file = new URL('../docs/openapi.json', import.meta.url);
const doc = JSON.parse(await readFile(file, 'utf8'));
doc.info.title = 'ZAYQORA Phase 4';
doc.info.version = '4.0.0';
doc.components.securitySchemes.csrf={type:'apiKey',in:'header',name:'X-CSRF-Token',description:'Account cookie mutations require the matching zayqora_csrf cookie value in this header, in addition to any guest CSRF header.'};
for (const [name, schema] of Object.entries({
  OperationalOrderContext: operationalOrderContext,
  OperationalSettings: operationSettingsSchema,
  StaffInvitation: invitationSchema,
  Recipe: recipeSchema,
  Coupon: couponSchema,
}))
  doc.components.schemas[name] = z.toJSONSchema(schema, { io: 'input' });
const response = {
  description:
    'Authoritative committed state. Monetary values are integer minor units (PostgreSQL bigint values may be decimal strings); ingredient quantities are integer thousandths. See phase-4-rules.md for state/ledger definitions.',
  content: {
    'application/json': {
      schema: {
        oneOf: [
          { type: 'object', additionalProperties: true },
          { type: 'array', items: { type: 'object', additionalProperties: true } },
        ],
      },
    },
  },
};
for (const { method, path, permission, schema } of operationalApiDefinitions) {
  const p = '/ops/{restaurantId}' + path.replace(/:([a-zA-Z]+)/g, '{$1}');
  const op: any = {
    summary: `${method.toUpperCase()} ${path}`,
    description: `Requires active default-branch membership and ${permission || 'authenticated discovery'} permission, freshly loaded on each request. Polling responses replace local state. New activity additionally requires active tenant, pilot ordering entitlement and configured feature flag; historical resolution remains controlled. No offline operations.`,
    security: [{ session: [], ...(method === 'get' ? {} : { csrf: [] }) }],
    parameters: [
      ...Array.from(p.matchAll(/\{([^}]+)\}/g)).map((m) => ({
        name: m[1],
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      })),
      {
        name: 'branchId',
        in: 'query',
        description:
          'Defaults to the tenant default branch; other branches are rejected in Phase 4.',
        schema: { type: 'string', format: 'uuid' },
      },
    ],
    responses: {
      200: response,
      ...Object.fromEntries(
        [400, 401, 403, 404, 409].map((n) => [n, { $ref: '#/components/responses/Error' }])
      ),
    },
  };
  if (method !== 'get')
    op.parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description:
        '8–128 characters; durable actor/tenant/branch-scoped original response. Different action or payload conflicts. Recheck authorization before replay.',
      schema: { type: 'string', pattern: '^[A-Za-z0-9:_-]{8,128}$' },
    });
  if (schema) {
    const json = z.toJSONSchema(schema, { io: 'input' });
    if (method === 'get') {
      const all = json.allOf ?? [json];
      for (const part of all)
        for (const [name, def] of Object.entries(part.properties ?? {}))
          op.parameters.push({
            name,
            in: 'query',
            required: part.required?.includes(name) ?? false,
            schema: def,
          });
    } else op.requestBody = { required: true, content: { 'application/json': { schema: json } } };
  }
  doc.paths[p] ??= {};
  doc.paths[p][method] = op;
}
for (const [path, schema, description] of [
  [
    '/commerce/{restaurantId}/context',
    operationalOrderContext,
    'Shared cart fulfillment context; POS requires pos.create and QR requires current table activation. Delivery prepaid only.',
  ],
  [
    '/commerce/{restaurantId}/table/join',
    z
      .object({ reference: z.string().min(40).max(100), activation: z.string().min(12).max(100) })
      .strict(),
    'Printed QR alone gives no record access. Returns visit/table details and issues a signed HttpOnly visit capability; closure invalidates ordering.',
  ],
  [
    '/commerce/{restaurantId}/orders/{orderId}/review',
    z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().min(3).max(2000),
      token: z.string().optional(),
    }),
    'Completed authenticated ownership or single-use emailed invitation; unique per order.',
  ],
  [
    '/commerce/{restaurantId}/reviews/{id}/report',
    z.object({ reason: z.string().min(3).max(500) }),
    'Authenticated abuse report. Reporting does not automatically hide a review.',
  ],
  [
    '/staff-invitations/accept',
    z.object({ token: z.string().min(40).max(100) }).strict(),
    'Verified matching email. Single use, 48 hours, revocation and inviter management scope checked.',
  ],
] as const) {
  doc.paths[path] ??= {};
  doc.paths[path].post = {
    summary: description,
    security: path.startsWith('/commerce')
      ? [
          { guestSession: [], guestCsrf: [], session: [], csrf: [] },
          { guestSession: [], guestCsrf: [] },
        ]
      : [{ session: [], csrf: [] }],
    parameters: Array.from(path.matchAll(/\{([^}]+)\}/g)).map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    })),
    requestBody: {
      required: true,
      content: { 'application/json': { schema: z.toJSONSchema(schema, { io: 'input' }) } },
    },
    responses: {
      200: response,
      403: { $ref: '#/components/responses/Error' },
      409: { $ref: '#/components/responses/Error' },
    },
  };
}
doc.paths['/ops/{restaurantId}/exports/{id}/download'] = {
  get: {
    summary:
      'Private export download; membership, branch, exports.generate and customers.export (customer data) rechecked. Pending/expired unavailable; never public.',
    security: [{ session: [] }],
    parameters: ['restaurantId', 'id'].map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    })),
    responses: {
      200: {
        description:
          'Private attachment. UTF-8 CSV formula-safe text or paginated ASCII text PDF. Expiry 24 hours.',
        content: {
          'text/csv': { schema: { type: 'string' } },
          'application/pdf': { schema: { type: 'string', format: 'binary' } },
        },
      },
      403: { $ref: '#/components/responses/Error' },
      409: { $ref: '#/components/responses/Error' },
    },
  },
};
doc.paths['/commerce/{restaurantId}/reviews'] = {
  get: {
    summary:
      'Published verified reviews and aggregate over all published reviews; includes negative ratings, no invented values.',
    security: [{ guestSession: [] }],
    responses: { 200: response },
  },
};
await writeFile(file, JSON.stringify(doc, null, 2) + '\n');
await pool.end();
