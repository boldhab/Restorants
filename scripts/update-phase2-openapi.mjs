import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import * as contracts from '../packages/contracts/dist/index.js';
const path = new URL('../docs/openapi.json', import.meta.url);
const doc = JSON.parse(await readFile(path, 'utf8'));
doc.info.title = 'ZAYQORA Phase 2';
doc.info.version = '2.0.0';
const schemas = {
  Draft: contracts.draftSchema,
  SaveDraft: contracts.saveDraftSchema,
  Settings: contracts.settingsSchema,
  Category: contracts.categorySchema,
  Item: contracts.itemSchema,
  Availability: contracts.availabilitySchema,
  Configuration: contracts.configurationSchema,
  Theme: contracts.themeSchema,
};
for (const [name, schema] of Object.entries(schemas))
  doc.components.schemas[name] = z.toJSONSchema(schema);
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const version = { type: 'integer', minimum: 0 };
const versioned = (name, key) =>
  json({
    type: 'object',
    required: ['version', key],
    additionalProperties: false,
    properties: { version, [key]: ref(name) },
  });
function route(path, method, summary, body, publicRoute = false) {
  const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string', ...(m[1].endsWith('Id') ? { format: 'uuid' } : {}) },
  }));
  doc.paths[path] ??= {};
  doc.paths[path][method] = {
    summary,
    description: publicRoute
      ? 'Published data only. No shared caching.'
      : 'Requires verified active membership and restaurant:update permission. Cookie mutations require X-CSRF-Token. Version mismatch returns 409. Variant and modifier edits are nested in item records; hours and exceptions in settings. Archive records instead of deleting them.',
    parameters,
    security: publicRoute ? [] : [{ session: [] }],
    ...(body ? { requestBody: body } : {}),
    responses: {
      [method === 'post' && summary.startsWith('Create') ? '201' : '200']: {
        description: 'Success',
      },
      400: { description: 'Validation error' },
      401: { description: 'Session required' },
      403: { description: 'Permission or CSRF failure' },
      404: { description: 'Resource unavailable' },
      409: { description: 'Version conflict or referenced image' },
    },
  };
}
const root = '/restaurants/{restaurantId}';
route(root + '/settings', 'get', 'Read operating settings');
route(root + '/settings', 'patch', 'Replace operating settings', versioned('Settings', 'settings'));
for (const kind of ['categories', 'items']) {
  const schema = kind === 'categories' ? 'Category' : 'Item';
  route(root + `/menu/${kind}`, 'get', `List ${kind} (offset and limit pagination)`);
  doc.paths[root + `/menu/${kind}`].get.parameters.push(
    { in: 'query', name: 'offset', schema: { type: 'integer', minimum: 0, default: 0 } },
    {
      in: 'query',
      name: 'limit',
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    }
  );
  route(
    root + `/menu/${kind}`,
    'post',
    `Create ${schema.toLowerCase()}`,
    versioned(schema, 'record')
  );
  route(
    root + `/menu/${kind}/{recordId}`,
    'patch',
    `Replace or archive ${schema.toLowerCase()}`,
    versioned(schema, 'record')
  );
}
route(
  root + '/menu/categories/reorder',
  'post',
  'Persist category order',
  json({
    type: 'object',
    required: ['version', 'ids'],
    properties: { version, ids: { type: 'array', items: { type: 'string', format: 'uuid' } } },
  })
);
route(root + '/menu/items/{itemId}/availability', 'get', 'Read operational availability');
route(
  root + '/menu/items/{itemId}/availability',
  'patch',
  'Update operational availability immediately',
  json(ref('Availability'))
);
route(root + '/website/draft', 'get', 'Read saved draft, readiness, media and publication history');
route(root + '/website/draft', 'patch', 'Atomically save complete draft', json(ref('SaveDraft')));
route(
  root + '/website/theme',
  'patch',
  'Replace controlled theme settings',
  versioned('Theme', 'theme')
);
route(root + '/website/preview', 'get', 'Read private saved-draft preview');
route(root + '/website/validate', 'post', 'Check saved publication readiness');
for (const action of ['publish', 'unpublish'])
  route(
    root + `/website/${action}`,
    'post',
    action === 'publish'
      ? 'Publish immutable revision (idempotent per draft version)'
      : 'Remove public publication pointer',
    json({
      type: 'object',
      required: ['version'],
      additionalProperties: false,
      properties: { version },
    })
  );
route(root + '/media', 'post', 'Create validated re-encoded image', {
  required: true,
  content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
});
doc.paths[root + '/media'].post.parameters.push({
  in: 'header',
  name: 'X-Image-Alt',
  description: 'Alternative text; percent-encode Unicode for HTTP header transport.',
  required: true,
  schema: { type: 'string', minLength: 1, maxLength: 300 },
});
route(root + '/media/{assetId}', 'get', 'Read tenant-owned private image');
route(root + '/media/{assetId}', 'delete', 'Delete unreferenced image');
route('/public/website-index', 'get', 'List published URLs for sitemap', undefined, true);
route(
  '/public/restaurants/{slug}',
  'get',
  'Read active published website and live availability',
  undefined,
  true
);
route(
  '/public/restaurants/{slug}/menu',
  'get',
  'Read active published menu and live availability',
  undefined,
  true
);
route(
  '/public/restaurants/{slug}/menu/configuration',
  'post',
  'Validate published dish configuration and return menu pricing',
  json(ref('Configuration')),
  true
);
doc.paths['/public/restaurants/{slug}/menu/configuration'].post.parameters.push({
  in: 'query',
  name: 'mode',
  schema: { type: 'string', enum: ['dine_in', 'takeaway', 'delivery'] },
});
route(
  '/public/restaurants/{slug}/media/{assetId}',
  'get',
  'Read image referenced by active publication',
  undefined,
  true
);
await writeFile(path, JSON.stringify(doc, null, 2) + '\n');
