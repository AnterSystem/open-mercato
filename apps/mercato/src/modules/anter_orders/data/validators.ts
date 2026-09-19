import { z } from 'zod'

export const anterPartnerTermsCreateSchema = z.object({
  customerEntityId: z.string().uuid(),
  defaultDiscountRate: z.coerce.number().min(0).max(1).default(0),
  priceListCode: z.string().trim().max(64).nullable().optional(),
  isBlocked: z.boolean().default(false),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const anterPartnerTermsUpdateSchema = anterPartnerTermsCreateSchema.partial().extend({
  id: z.string().uuid(),
})

export type AnterPartnerTermsCreateInput = z.infer<typeof anterPartnerTermsCreateSchema>
export type AnterPartnerTermsUpdateInput = z.infer<typeof anterPartnerTermsUpdateSchema>

export const anterPartnerGroupDiscountCreateSchema = z.object({
  partnerTermsId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  discountRate: z.coerce.number().min(0).max(1),
})

export const anterPartnerGroupDiscountUpdateSchema = anterPartnerGroupDiscountCreateSchema
  .partial()
  .extend({ id: z.string().uuid() })

export type AnterPartnerGroupDiscountCreateInput = z.infer<typeof anterPartnerGroupDiscountCreateSchema>
export type AnterPartnerGroupDiscountUpdateInput = z.infer<typeof anterPartnerGroupDiscountUpdateSchema>

export const anterStockItemCreateSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  onHand: z.coerce.number().int().min(0).default(0),
  expectedRestockAt: z.coerce.date().nullable().optional(),
})

export const anterStockItemUpdateSchema = anterStockItemCreateSchema.partial().extend({
  id: z.string().uuid(),
})

export type AnterStockItemCreateInput = z.infer<typeof anterStockItemCreateSchema>
export type AnterStockItemUpdateInput = z.infer<typeof anterStockItemUpdateSchema>

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
})

export const anterPartnerTermsListSchema = paginationSchema.extend({
  id: z.string().uuid().optional(),
  customerEntityId: z.string().uuid().optional(),
  sortField: z.enum(['id', 'customer_entity_id', 'created_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export const anterPartnerGroupDiscountListSchema = paginationSchema.extend({
  id: z.string().uuid().optional(),
  partnerTermsId: z.string().uuid().optional(),
  sortField: z.enum(['id', 'partner_terms_id', 'created_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export const anterStockItemListSchema = paginationSchema.extend({
  id: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  sortField: z.enum(['id', 'product_id', 'created_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})
