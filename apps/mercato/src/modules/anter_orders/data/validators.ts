import { z } from 'zod'

export const anterAccountTypeSchema = z.enum(['full', 'hidden', 'preview'])

export const anterPartnerTermsCreateSchema = z.object({
  customerEntityId: z.string().uuid(),
  defaultDiscountRate: z.coerce.number().min(0).max(1).default(0),
  priceListCode: z.string().trim().max(64).nullable().optional(),
  isBlocked: z.boolean().default(false),
  notes: z.string().trim().max(2000).nullable().optional(),
  accountType: anterAccountTypeSchema.default('full'),
  accountOwnerUserId: z.string().uuid().nullable().optional(),
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

// Configurator spec X3: `anter_partner_price_list_scope` rows are always
// exclusions — no rows means everything is included for that partner.
export const anterPartnerPriceListScopeSetSchema = z.object({
  partnerTermsId: z.string().uuid(),
  excludedCategoryIds: z.array(z.string().uuid()),
})
export type AnterPartnerPriceListScopeSetInput = z.infer<typeof anterPartnerPriceListScopeSetSchema>

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

export const anterOrderListSchema = paginationSchema.extend({
  id: z.string().uuid().optional(),
  customerEntityId: z.string().uuid().optional(),
  status: z.string().optional(),
  sortField: z.enum(['id', 'order_number', 'created_at', 'placed_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export type AnterOrderListQuery = z.infer<typeof anterOrderListSchema>

export const anterOrderLineListSchema = paginationSchema.extend({
  id: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  fulfilmentMode: z.enum(['stock', 'production']).optional(),
  lineStatus: z.string().optional(),
  sortField: z.enum(['id', 'order_id', 'line_number', 'created_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export type AnterOrderLineListQuery = z.infer<typeof anterOrderLineListSchema>

export const anterShipmentListSchema = paginationSchema.extend({
  id: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  status: z.string().optional(),
  sortField: z.enum(['id', 'order_id', 'sequence_number', 'created_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export type AnterShipmentListQuery = z.infer<typeof anterShipmentListSchema>

export const anterShipmentCreateCommandSchema = z.object({
  orderId: z.string().uuid(),
  weightKg: z.coerce.number().min(0).optional(),
  packageCount: z.coerce.number().int().min(0).optional(),
  shippingCostNet: z.coerce.number().min(0).optional(),
  lines: z.array(z.object({
    orderLineId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
  })).min(1),
})

export const anterShipmentDispatchCommandSchema = z.object({
  carrierName: z.string().trim().min(1).max(128),
  trackingNumber: z.string().trim().min(1).max(128),
})

export const anterInvoiceListSchema = paginationSchema.extend({
  id: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  sortField: z.enum(['id', 'order_id', 'issued_at', 'created_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export type AnterInvoiceListQuery = z.infer<typeof anterInvoiceListSchema>

export const anterInvoiceRecordCommandSchema = z.object({
  orderId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1).max(64),
  issuedAt: z.coerce.date(),
  netAmount: z.coerce.number().min(0),
  grossAmount: z.coerce.number().min(0),
  attachmentId: z.string().uuid().nullable().optional(),
})

export const anterOrderPlaceLineSchema = z.object({
  productId: z.string().uuid(),
  productVariantId: z.string().uuid().nullable().optional(),
  sku: z.string().trim().max(128).nullable().optional(),
  nameSnapshot: z.string().trim().min(1).max(256),
  variantSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  quantity: z.coerce.number().positive(),
  unitCode: z.string().trim().max(32).nullable().optional(),
  listUnitPriceNet: z.coerce.number().min(0),
  unitPriceNet: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(1).default(0),
})

export const anterOrderPlaceSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  customerEntityId: z.string().uuid(),
  customerUserId: z.string().uuid(),
  currencyCode: z.string().trim().length(3),
  deliveryMode: z.enum(['partner_warehouse', 'end_customer', 'self_collection']),
  deliveryAddressSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).default(0),
  shippingNetAmount: z.coerce.number().min(0).default(0),
  partnerReference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sourceCartId: z.string().uuid().nullable().optional(),
  // Configurator spec X7: set by `anter_portal`'s checkout when any line in
  // the cart came from `anter_configurator` (§3.2 — the order module never
  // resolves this itself, it only stores what the caller tells it).
  source: z.enum(['catalog', 'configurator']).default('catalog'),
  configuratorRevisionId: z.string().uuid().nullable().optional(),
  lines: z.array(anterOrderPlaceLineSchema).min(1),
})

export type AnterOrderPlaceInput = z.infer<typeof anterOrderPlaceSchema>
export type AnterOrderPlaceLineInput = z.infer<typeof anterOrderPlaceLineSchema>
