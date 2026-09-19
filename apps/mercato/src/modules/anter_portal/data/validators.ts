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

const validators = {
  anterCatalogListQuerySchema,
  anterCartAddLineSchema,
  anterCartUpdateLineSchema,
  anterCartUpdateHeaderSchema,
}

export default validators
