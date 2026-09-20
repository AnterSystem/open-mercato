import { z } from 'zod'

export const anterCatalogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  categoryId: z.string().uuid().nullable().optional(),
  q: z.string().trim().min(1).max(190).nullable().optional(),
})

export type AnterCatalogListQuery = z.infer<typeof anterCatalogListQuerySchema>

export const anterCartAddLineSchema = z.object({
  productId: z.string().uuid(),
  productVariantId: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().positive(),
})

export type AnterCartAddLineInput = z.infer<typeof anterCartAddLineSchema>

// Bulk add (spec X13): a BOM adds tens of lines at once; a per-line loop
// would leave a half-filled cart on failure, so this is transactional.
export const anterCartAddLinesSchema = z.object({
  lines: z.array(anterCartAddLineSchema).min(1),
  // Configurator spec X6: tags every line added by this call so checkout can
  // mark the resulting order `source: 'configurator'` (X7).
  sourceRevisionId: z.string().uuid().nullable().optional(),
})

export type AnterCartAddLinesInput = z.infer<typeof anterCartAddLinesSchema>

export const anterCartUpdateLineSchema = z.object({
  quantity: z.coerce.number().positive(),
})

export type AnterCartUpdateLineInput = z.infer<typeof anterCartUpdateLineSchema>

export const anterCartUpdateHeaderSchema = z.object({
  deliveryMode: z.enum(['partner_warehouse', 'end_customer', 'self_collection']).optional(),
  deliveryAddressId: z.string().uuid().nullable().optional(),
  deliveryAddressSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  partnerReference: z.string().trim().max(64).nullable().optional(),
})

export type AnterCartUpdateHeaderInput = z.infer<typeof anterCartUpdateHeaderSchema>

export const anterCheckoutSchema = z.object({
  partnerReference: z.string().trim().max(64).nullable().optional(),
})

export type AnterCheckoutInput = z.infer<typeof anterCheckoutSchema>

const validators = {
  anterCatalogListQuerySchema,
  anterCartAddLineSchema,
  anterCartUpdateLineSchema,
  anterCartUpdateHeaderSchema,
  anterCheckoutSchema,
}

export default validators
