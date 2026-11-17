import { z } from 'zod';
const text = z.string().trim().max(4000);
const name = z.string().trim().min(1).max(120);
const id = z.uuid();
const money = z.number().int().min(0).max(100000000);
export const intervalSchema = z
  .object({ start: z.number().int().min(0).max(1439), end: z.number().int().min(0).max(1439) })
  .strict()
  .refine((v) => v.start !== v.end, 'Start and end must differ');
const intervals = z
  .array(intervalSchema)
  .max(8)
  .superRefine((values, ctx) => {
    const ranges = values.map((v) => [v.start, v.end > v.start ? v.end : v.end + 1440]);
    for (let i = 0; i < ranges.length; i++)
      for (let j = i + 1; j < ranges.length; j++) {
        if (ranges[i][0] < ranges[j][1] && ranges[j][0] < ranges[i][1])
          ctx.addIssue({ code: 'custom', message: 'Intervals overlap' });
      }
  });
export const hoursSchema = z
  .object({
    week: z.array(intervals).length(7),
    exceptions: z.array(z.object({ date: z.iso.date(), intervals, label: text }).strict()).max(100),
  })
  .strict()
  .superRefine((h, ctx) => {
    if (new Set(h.exceptions.map((e) => e.date)).size !== h.exceptions.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate exception dates' });
    for (let day = 0; day < 7; day++)
      for (const previous of h.week[(day + 6) % 7]) {
        if (previous.end < previous.start && h.week[day].some((i) => i.start < previous.end))
          ctx.addIssue({ code: 'custom', message: 'Overnight interval overlaps the next day' });
      }
  });
export const settingsSchema = z
  .object({
    name: name.min(2).max(100),
    description: text,
    category: name.min(2).max(50),
    phone: z
      .string()
      .trim()
      .min(5)
      .max(30)
      .regex(/^\+?[0-9 ().-]+$/, 'Use a valid contact phone number')
      .refine((v) => v.replace(/\D/g, '').length >= 5, 'Include at least five phone digits'),
    email: z.email().max(255),
    address: z.string().trim().min(1).max(255),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid IANA timezone'),
    currency: z
      .string()
      .refine(
        (v) => Intl.supportedValuesOf('currency').includes(v),
        'Use a supported ISO 4217 currency'
      ),
    serviceModes: z.array(z.enum(['dine_in', 'takeaway', 'delivery'])).min(1),
    hours: hoursSchema,
    logo: id.nullable(),
    cover: id.nullable(),
  })
  .strict();
export const categorySchema = z
  .object({
    id,
    name,
    description: text,
    image: id.nullable(),
    order: z.number().int().min(0),
    active: z.boolean(),
  })
  .strict();
export const variantSchema = z.object({ id, name, price: money }).strict();
const optionSchema = z.object({ id, name, price: money, available: z.boolean() }).strict();
export const modifierSchema = z
  .object({
    id,
    name,
    min: z.number().int().min(0),
    max: z.number().int().min(1).max(30),
    options: z.array(optionSchema).max(30),
  })
  .strict()
  .superRefine((g, ctx) => {
    if (g.min > g.max || g.max > g.options.filter((o) => o.available).length)
      ctx.addIssue({ code: 'custom', message: 'Selection limits must fit the available options' });
    if (new Set(g.options.map((o) => o.id)).size !== g.options.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate options' });
  });
export const itemSchema = z
  .object({
    id,
    categoryId: id,
    name,
    description: text,
    image: id.nullable(),
    price: money,
    preparationMinutes: z.number().int().min(0).max(1440),
    featured: z.boolean(),
    dietary: text,
    allergens: text,
    state: z.enum(['draft', 'active', 'archived']),
    variants: z.array(variantSchema).max(30),
    modifiers: z.array(modifierSchema).max(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    const optionIds = v.modifiers.flatMap((g) => g.options.map((o) => o.id));
    if (new Set(optionIds).size !== optionIds.length)
      ctx.addIssue({ code: 'custom', message: 'Option identifiers must be unique across groups' });
    for (const list of [v.variants, v.modifiers])
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate identifiers' });
  });
export const sectionNames = [
  'hero',
  'featured',
  'menu',
  'about',
  'gallery',
  'hours',
  'contact',
] as const;
export const themeSchema = z
  .object({
    title: name,
    description: text,
    story: text,
    color: z.enum(['forest', 'navy', 'terracotta']),
    font: z.enum(['serif', 'sans']),
    gallery: z.array(id).max(20),
    socialImage: id.nullable(),
    policy: text,
    sections: z
      .array(z.object({ name: z.enum(sectionNames), visible: z.boolean() }).strict())
      .max(7),
  })
  .strict()
  .refine(
    (v) => new Set(v.sections.map((s) => s.name)).size === v.sections.length,
    'Duplicate sections'
  );
export const draftSchema = z
  .object({
    settings: settingsSchema,
    categories: z.array(categorySchema).max(100),
    items: z.array(itemSchema).max(1000),
    theme: themeSchema,
  })
  .strict()
  .superRefine((d, ctx) => {
    for (const list of [d.items, d.categories])
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate identifiers' });
    if (new Set(d.categories.map((x) => x.name.toLowerCase())).size !== d.categories.length)
      ctx.addIssue({ code: 'custom', message: 'Category names must be unique' });
    for (const item of d.items)
      if (!d.categories.some((c) => c.id === item.categoryId))
        ctx.addIssue({ code: 'custom', path: ['items'], message: 'Unknown category' });
  });
export const saveDraftSchema = z
  .object({ version: z.number().int().min(0), draft: draftSchema })
  .strict();
export const availabilitySchema = z
  .object({
    soldOut: z.boolean(),
    enabled: z.boolean(),
    serviceModes: z.array(z.enum(['dine_in', 'takeaway', 'delivery'])).min(1),
    hours: hoursSchema.nullable(),
  })
  .strict();
export const configurationSchema = z
  .object({ revision: id, itemId: id, variantId: id.optional(), options: z.array(id).max(100) })
  .strict();
export type Draft = z.infer<typeof draftSchema>;
export type Hours = z.infer<typeof hoursSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export function initialDraft(r: {
  name: string;
  category: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  currency: string;
}): Draft {
  return {
    settings: {
      ...r,
      description: '',
      currency: r.currency,
      serviceModes: ['dine_in'],
      hours: { week: Array.from({ length: 7 }, () => []), exceptions: [] },
      logo: null,
      cover: null,
    },
    categories: [],
    items: [],
    theme: {
      title: r.name,
      description: '',
      story: '',
      color: 'forest',
      font: 'serif',
      gallery: [],
      socialImage: null,
      policy: '',
      sections: sectionNames.map((name) => ({ name, visible: true })),
    },
  };
}
export function mediaIds(d: Draft): string[] {
  return [
    ...new Set(
      [
        d.settings.logo,
        d.settings.cover,
        d.theme.socialImage,
        ...d.theme.gallery,
        ...d.categories.map((c) => c.image),
        ...d.items.map((i) => i.image),
      ].filter((x): x is string => !!x)
    ),
  ];
}
export function readiness(d: Draft): string[] {
  const parsed = draftSchema.safeParse(d);
  const issues: string[] = parsed.success
    ? []
    : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  if (!d.settings.description) issues.push('Add a restaurant description');
  if (!d.settings.cover) issues.push('Upload a cover image');
  if (!d.settings.hours.week.some((day) => day.length))
    issues.push('Configure weekly opening hours');
  if (
    !d.items.some(
      (i) => i.state === 'active' && d.categories.some((c) => c.id === i.categoryId && c.active)
    )
  )
    issues.push('Add an active item in a visible category');
  return issues;
}
export function isOpen(hours: Hours, timezone: string, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const minute = Number(get('hour')) * 60 + Number(get('minute'));
  const local = new Date(`${date}T12:00:00Z`);
  const day = local.getUTCDay();
  const exception = hours.exceptions.find((e) => e.date === date);
  const today = exception?.intervals ?? hours.week[day];
  if (today.some((i) => minute >= i.start && (i.end < i.start || minute < i.end))) return true;
  if (exception) return false; // Today's exception suppresses yesterday's spillover.
  local.setUTCDate(local.getUTCDate() - 1);
  const previous =
    hours.exceptions.find((e) => e.date === local.toISOString().slice(0, 10))?.intervals ??
    hours.week[(day + 6) % 7];
  return previous.some((i) => i.end < i.start && minute < i.end);
}
export function configurationPrice(
  item: Item,
  variantId: string | undefined,
  selected: string[]
): number {
  if (new Set(selected).size !== selected.length) throw new Error('Select each option once');
  const variant = item.variants.find((v) => v.id === variantId);
  if (item.variants.length && !variant) throw new Error('Choose a valid variant');
  if (!item.variants.length && variantId) throw new Error('Unknown variant');
  let price = variant?.price ?? item.price;
  const eligible = item.modifiers.flatMap((g) => g.options.filter((o) => o.available));
  if (selected.some((id) => !eligible.some((o) => o.id === id)))
    throw new Error('Unknown or unavailable option');
  for (const group of item.modifiers) {
    const options = group.options.filter((o) => selected.includes(o.id));
    if (options.length < group.min || options.length > group.max)
      throw new Error(`Choose ${group.min}–${group.max} options for ${group.name}`);
    for (const option of options) price += option.price;
  }
  if (!Number.isSafeInteger(price)) throw new Error('Price exceeds supported range');
  return price;
}
export function formatMoney(amount: number, currency: string): string {
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount / 10 ** digits);
}
