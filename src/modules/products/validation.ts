import { z } from 'zod';

/**
 * Product form schemas, shared by the client form and the server action.
 *
 * Money arrives as minor units and quantities as base units (×1000) — the
 * inputs convert before submitting, so nothing here has to guess about
 * decimals or currency.
 */

export const variantSchema = z.object({
  /** Present when editing an existing variant. */
  id: z.string().optional().nullable(),
  name: z.string().trim().min(1, 'أدخل اسم الصنف').max(80),
  sku: z.string().trim().max(40).optional().or(z.literal('')),
  barcode: z
    .string()
    .trim()
    .max(40)
    .regex(/^[\w-]*$/, 'باركود غير صالح')
    .optional()
    .or(z.literal('')),
  unitLabel: z.string().trim().min(1, 'أدخل وحدة البيع').max(24),
  /** Base units in one sale unit, ×1000. */
  displayFactor: z.number().int().positive('حدد حجم وحدة البيع'),
  allowsFractional: z.boolean().default(false),
  sellingPrice: z.number().int().min(0, 'السعر لا يمكن أن يكون سالباً'),
  wholesalePrice: z.number().int().min(0).default(0),
  purchasePrice: z.number().int().min(0).default(0),
  /** Base units, ×1000. */
  minimumStock: z.number().int().min(0).default(0),
  /** Only honoured on creation — later changes go through a stock adjustment. */
  openingStock: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export type VariantInput = z.infer<typeof variantSchema>;

export const productSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, 'أدخل اسم المنتج').max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  categoryId: z.string().min(1).optional().nullable(),
  brandId: z.string().min(1).optional().nullable(),
  unitKind: z.enum(['COUNT', 'WEIGHT', 'VOLUME']),
  trackInventory: z.boolean().default(true),
  isAgeRestricted: z.boolean().default(true),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  imageUrl: z.string().trim().max(500).optional().or(z.literal('')),
  variants: z.array(variantSchema).min(1, 'أضف صنفاً واحداً على الأقل').max(40),
});

export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, 'أدخل اسم التصنيف').max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'لون غير صالح')
    .optional()
    .or(z.literal('')),
  isActive: z.boolean().default(true),
});

export const brandSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, 'أدخل اسم الماركة').max(60),
  isActive: z.boolean().default(true),
});

/**
 * A URL-safe slug. Arabic names transliterate badly, so when nothing usable
 * survives we fall back to a short random suffix rather than an empty string.
 */
export function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 48);

  return base.length >= 2 ? base : `c-${Math.random().toString(36).slice(2, 8)}`;
}

/** Deterministic SKU when the user leaves the field blank. */
export function generateSku(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}
