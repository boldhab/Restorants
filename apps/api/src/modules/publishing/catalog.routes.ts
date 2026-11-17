import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  categorySchema,
  draftSchema,
  itemSchema,
  settingsSchema,
  themeSchema,
  type Draft,
} from '@zayqora/contracts';
import { readDraft, saveDraft } from './publishing.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
const handle =
  (
    fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<unknown>
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export const catalogRouter = Router({ mergeParams: true });
async function edit(
  restaurantId: string,
  body: unknown,
  schema: z.ZodType,
  mutate: (draft: Draft, input: any) => void
) {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new ValidationError(
      'Invalid fields',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  const input = result.data as any;
  const saved = await readDraft(restaurantId);
  if (saved.version !== input.version)
    throw new ConflictError('Newer edits exist. Reload before saving.');
  mutate(saved.draft, input);
  const draft = draftSchema.safeParse(saved.draft);
  if (!draft.success)
    throw new ValidationError(
      'Invalid menu',
      draft.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  return saveDraft(restaurantId, input.version, draft.data);
}
const version = z.number().int().min(0);
catalogRouter.get(
  '/settings',
  handle(async (req, res) => {
    const d = await readDraft(req.tenantContext!.restaurantId);
    res.json({ version: d.version, settings: d.draft.settings, issues: d.issues });
  })
);
catalogRouter.patch(
  '/settings',
  handle(async (req, res) =>
    res.json(
      await edit(
        req.tenantContext!.restaurantId,
        req.body,
        z.object({ version, settings: settingsSchema }).strict(),
        (d, i) => {
          d.settings = i.settings;
        }
      )
    )
  )
);
catalogRouter.patch(
  '/website/theme',
  handle(async (req, res) =>
    res.json(
      await edit(
        req.tenantContext!.restaurantId,
        req.body,
        z.object({ version, theme: themeSchema }).strict(),
        (d, i) => {
          d.theme = i.theme;
        }
      )
    )
  )
);
for (const kind of ['categories', 'items'] as const) {
  const schema = kind === 'categories' ? categorySchema : itemSchema;
  catalogRouter.get(
    `/menu/${kind}`,
    handle(async (req, res) => {
      const pagination = z
        .object({
          offset: z.coerce.number().int().min(0).default(0),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .safeParse(req.query);
      if (!pagination.success) throw new ValidationError('Invalid pagination');
      const d = await readDraft(req.tenantContext!.restaurantId),
        list = d.draft[kind];
      const { offset, limit } = pagination.data;
      res.json({
        version: d.version,
        total: list.length,
        [kind]: list.slice(offset, offset + limit),
      });
    })
  );
  catalogRouter.post(
    `/menu/${kind}`,
    handle(async (req, res) =>
      res.status(201).json(
        await edit(
          req.tenantContext!.restaurantId,
          req.body,
          z.object({ version, record: schema }).strict(),
          (d, i) => {
            if (d[kind].some((r) => r.id === i.record.id))
              throw new ConflictError('Identifier already exists');
            (d[kind] as any[]).push(i.record);
          }
        )
      )
    )
  );
  catalogRouter.patch(
    `/menu/${kind}/:recordId`,
    handle(async (req, res) =>
      res.json(
        await edit(
          req.tenantContext!.restaurantId,
          req.body,
          z.object({ version, record: schema }).strict(),
          (d, i) => {
            const n = d[kind].findIndex((r) => r.id === req.params.recordId);
            if (n < 0) throw new NotFoundError('Record not found');
            if (i.record.id !== req.params.recordId)
              throw new ValidationError('Identifiers cannot change');
            (d[kind] as any[])[n] = i.record;
          }
        )
      )
    )
  );
}
catalogRouter.post(
  '/menu/categories/reorder',
  handle(async (req, res) =>
    res.json(
      await edit(
        req.tenantContext!.restaurantId,
        req.body,
        z.object({ version, ids: z.array(z.uuid()).max(100) }).strict(),
        (d, i) => {
          if (
            i.ids.length !== d.categories.length ||
            new Set(i.ids).size !== i.ids.length ||
            i.ids.some((id: string) => !d.categories.some((c) => c.id === id))
          )
            throw new ValidationError('Supply every category identifier exactly once');
          d.categories
            .sort((a, b) => i.ids.indexOf(a.id) - i.ids.indexOf(b.id))
            .forEach((c, n) => {
              c.order = n;
            });
        }
      )
    )
  )
);
