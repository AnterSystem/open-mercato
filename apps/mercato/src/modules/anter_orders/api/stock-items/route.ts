import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { invalidateCrudCache } from '@open-mercato/shared/lib/crud/cache'
import { AnterStockItem } from '../../data/entities'
import {
  anterStockItemCreateSchema,
  anterStockItemListSchema,
  anterStockItemUpdateSchema,
} from '../../data/validators'
import {
  createAnterOrdersCrudOpenApi,
  createAnterOrdersPagedListResponseSchema,
  anterOrdersOkSchema,
} from '../openapi'

const ENTITY_ID = 'anter_orders:anter_stock_item' as const

type StockItemListQuery = z.infer<typeof anterStockItemListSchema>

const stockItemListItemSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  on_hand: z.number(),
  expected_restock_at: z.string().nullable().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] },
    POST: { requireAuth: true, requireFeatures: ['anter_orders.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['anter_orders.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['anter_orders.manage'] },
  },
  orm: {
    entity: AnterStockItem,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterStockItemListSchema,
    entityId: ENTITY_ID,
    fields: ['id', 'product_id', 'variant_id', 'on_hand', 'expected_restock_at', 'organization_id', 'tenant_id', 'updated_at'],
    sortFieldMap: {
      id: 'id',
      product_id: 'product_id',
      created_at: 'created_at',
    },
    buildFilters: async (query: StockItemListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.productId) filters.product_id = query.productId
      return filters
    },
  },
  create: {
    schema: anterStockItemCreateSchema,
    mapToEntity: (input) => ({
      productId: input.productId,
      variantId: input.variantId ?? null,
      onHand: input.onHand ?? 0,
      expectedRestockAt: input.expectedRestockAt ?? null,
    }),
    response: (entity) => ({ id: String(entity.id) }),
  },
  update: {
    schema: anterStockItemUpdateSchema,
    getId: (input) => input.id,
    applyToEntity: (entity, input) => {
      if (input.productId) entity.productId = input.productId
      if (input.variantId !== undefined) entity.variantId = input.variantId ?? null
      if (input.onHand != null) entity.onHand = input.onHand
      if (input.expectedRestockAt !== undefined) entity.expectedRestockAt = input.expectedRestockAt ?? null
    },
    response: () => ({ ok: true }),
  },
  del: {
    idFrom: 'body',
    softDelete: true,
    response: () => ({ ok: true }),
  },
  hooks: {
    afterCreate: async (entity, ctx) => {
      if (!ctx.auth) return
      await invalidateCrudCache(
        ctx.container,
        ENTITY_ID,
        { id: entity.id, organizationId: ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null, tenantId: ctx.auth.tenantId ?? null },
        ctx.auth.tenantId ?? null,
        'anter_orders.stock-item.create',
        [],
      )
    },
    afterUpdate: async (entity, ctx) => {
      if (!ctx.auth) return
      await invalidateCrudCache(
        ctx.container,
        ENTITY_ID,
        { id: entity.id, organizationId: ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null, tenantId: ctx.auth.tenantId ?? null },
        ctx.auth.tenantId ?? null,
        'anter_orders.stock-item.update',
        [],
      )
    },
    afterDelete: async (_id, ctx) => {
      if (!ctx.auth) return
      await invalidateCrudCache(
        ctx.container,
        ENTITY_ID,
        { organizationId: ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null, tenantId: ctx.auth.tenantId ?? null },
        ctx.auth.tenantId ?? null,
        'anter_orders.stock-item.delete',
        [],
      )
    },
  },
})

export const openApi = createAnterOrdersCrudOpenApi({
  resourceName: 'Stock Item',
  pluralName: 'Stock Items',
  querySchema: anterStockItemListSchema,
  listResponseSchema: createAnterOrdersPagedListResponseSchema(stockItemListItemSchema),
  create: {
    schema: anterStockItemCreateSchema,
    description: 'Creates an on-hand stock record for a product/variant.',
  },
  update: {
    schema: anterStockItemUpdateSchema,
    responseSchema: anterOrdersOkSchema,
    description: 'Updates an on-hand stock record.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: anterOrdersOkSchema,
    description: 'Soft-deletes a stock record.',
  },
})
