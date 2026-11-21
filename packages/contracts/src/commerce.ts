import { z } from 'zod';
const minor = z.number().int().min(0).max(100000000);
export const commerceSettingsSchema = z
  .object({
    enabled: z.boolean(),
    payAtPickup: z.boolean(),
    minimum: minor,
    taxBps: z.number().int().min(0).max(10000),
    serviceCharge: minor,
    leadMinutes: z.number().int().min(0).max(180),
    reservations: z.boolean(),
    capacity: z.number().int().min(1).max(500),
    durationMinutes: z.number().int().min(15).max(240),
    bufferMinutes: z.number().int().min(0).max(120),
    slotMinutes: z.enum(['15', '30', '60']),
    reservationLeadMinutes: z.number().int().min(15).max(10080),
    advanceDays: z.number().int().min(1).max(90),
    maxParty: z.number().int().min(1).max(100),
    holdMinutes: z.number().int().min(5).max(60),
    blackouts: z
      .array(
        z
          .object({
            start: z.iso.datetime({ offset: true }),
            end: z.iso.datetime({ offset: true }),
          })
          .refine(
            (v) => Date.parse(v.start) < Date.parse(v.end),
            'Blackout end must follow start'
          )
      )
      .max(100),
  })
  .strict()
  .refine((v) => v.maxParty <= v.capacity, 'Maximum party cannot exceed capacity');
export const defaultCommerceSettings = commerceSettingsSchema.parse({
  enabled: false,
  payAtPickup: true,
  minimum: 0,
  taxBps: 0,
  serviceCharge: 0,
  leadMinutes: 15,
  reservations: false,
  capacity: 20,
  durationMinutes: 60,
  bufferMinutes: 15,
  slotMinutes: '15',
  reservationLeadMinutes: 60,
  advanceDays: 30,
  maxParty: 8,
  holdMinutes: 15,
  blackouts: [],
});
export type CommerceSettings = z.infer<typeof commerceSettingsSchema>;
export const cartLineSchema = z
  .object({
    id: z.uuid().optional(),
    itemId: z.uuid(),
    variantId: z.uuid().optional(),
    options: z.array(z.uuid()).max(100),
    quantity: z.number().int().min(1).max(20),
  })
  .strict();
export type CartLine = z.infer<typeof cartLineSchema>;
export const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.email().max(255),
    phone: z.string().trim().min(5).max(30),
  })
  .strict();
export const submitOrderSchema = z
  .object({
    quoteId: z.uuid(),
    contact: contactSchema,
    method: z.enum(['pay_at_pickup', 'test_online']),
  })
  .strict();
export const reservationRequestSchema = z
  .object({
    start: z.iso.datetime({ offset: true }),
    party: z.number().int().min(1).max(100),
    contact: contactSchema,
  })
  .strict();
export const orderStates = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
] as const;
export const reservationStates = [
  'PENDING',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
  'SEATED',
  'COMPLETED',
  'NO_SHOW',
] as const;
export const orderTransitions: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY','CANCELLED'],
  READY: ['COMPLETED','CANCELLED'],
};
export function checkoutAmounts(subtotal: number, taxBps: number, serviceCharge: number) {
  const tax = Number((BigInt(subtotal) * BigInt(taxBps) + 5000n) / 10000n);
  const total = subtotal + tax + serviceCharge;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Amount exceeds supported range');
  return { subtotal, tax, serviceCharge, deliveryFee: 0, total };
}
