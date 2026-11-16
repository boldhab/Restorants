function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
import { z } from 'zod';

// Email normalization policy: lowercased, trimmed
export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .min(3, 'Email must be at least 3 characters')
  .max(255, 'Email cannot exceed 255 characters')
  .email('Invalid email address')
  .transform((val) => val.toLowerCase());

// Password policy: min 8 chars, max 100
export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters long')
  .max(72, 'Password cannot exceed 72 characters')
  .refine((v) => new TextEncoder().encode(v).length <= 72, 'Password cannot exceed 72 UTF-8 bytes');

// Slug policy: lowercase alphanumeric and hyphens only, no leading/trailing hyphen
export const slugSchema = z
  .string({ error: 'Slug is required' })
  .trim()
  .min(2, 'Slug must be at least 2 characters')
  .max(63, 'Slug cannot exceed 63 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must contain only lowercase letters, numbers, and hyphens without consecutive or trailing hyphens'
  );

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    full_name: z
      .string({ error: 'Full name is required' })
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name cannot exceed 100 characters'),
    phone: z.string().trim().max(30, 'Phone cannot exceed 30 characters').optional().nullable(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z.string({ error: 'Verification token is required' }).trim().min(1, 'Token is required'),
  })
  .strict();

export const resendVerificationSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string({ error: 'Reset token is required' }).trim().min(1, 'Token is required'),
    password: passwordSchema,
  })
  .strict();

export const createRestaurantSchema = z
  .object({
    name: z
      .string({ error: 'Restaurant name is required' })
      .trim()
      .min(2, 'Restaurant name must be at least 2 characters')
      .max(100, 'Restaurant name cannot exceed 100 characters'),
    slug: slugSchema,
    category: z
      .string({ error: 'Business category is required' })
      .trim()
      .min(2, 'Category must be at least 2 characters')
      .max(50, 'Category cannot exceed 50 characters'),
    phone: z
      .string({ error: 'Contact phone is required' })
      .trim()
      .min(5, 'Phone must be at least 5 characters')
      .max(30, 'Phone cannot exceed 30 characters'),
    email: emailSchema,
    country: z
      .string({ error: 'Country is required' })
      .trim()
      .min(2, 'Country must be at least 2 characters')
      .max(100, 'Country cannot exceed 100 characters'),
    city: z
      .string({ error: 'City is required' })
      .trim()
      .min(2, 'City must be at least 2 characters')
      .max(100, 'City cannot exceed 100 characters'),
    address: z
      .string({ error: 'Address is required' })
      .trim()
      .min(3, 'Address must be at least 3 characters')
      .max(255, 'Address cannot exceed 255 characters'),
    currency: z
      .string({ error: 'Currency is required' })
      .trim()
      .length(3, 'Currency must be a 3-letter ISO code')
      .regex(/^[a-zA-Z]{3}$/, 'Currency must contain three letters')
      .transform((v) => v.toUpperCase()),
    initial_branch: z
      .object({
        name: z.string().trim().min(2).max(100),
        address: z.string().trim().min(3).max(255).optional(),
      })
      .strict()
      .optional(),
    timezone: z
      .string({ error: 'Timezone is required' })
      .trim()
      .min(1, 'Timezone is required')
      .refine(validTimezone, 'Invalid IANA timezone'),
  })
  .strict();

export const updateRestaurantSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    category: z.string().trim().min(2).max(50).optional(),
    phone: z.string().trim().min(5).max(30).optional(),
    email: emailSchema.optional(),
    country: z.string().trim().min(2).max(100).optional(),
    city: z.string().trim().min(2).max(100).optional(),
    address: z.string().trim().min(3).max(255).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .regex(/^[a-zA-Z]{3}$/)
      .transform((v) => v.toUpperCase())
      .optional(),
    timezone: z.string().trim().min(1).refine(validTimezone, 'Invalid IANA timezone').optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
