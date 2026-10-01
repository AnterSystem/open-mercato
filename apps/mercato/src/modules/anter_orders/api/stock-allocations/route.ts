import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { AnterStockAllocation } from '../../data/entities'
import { anterStockAllocationListSchema } from '../../data/validators'

const ENTITY_ID = 'anter_orders:anter_stock_allocation' as const

type StockAllocationListQuery = z.infer<typeof anterStockAllocationListSchema>

/**
 * Read-only view of what a line has reserved, for the back-office order
 * detail. GET-only for the same reason `order-lines/route.ts` is: allocations
 * are written by `anter_orders.stock.allocate` and the shipment commands, and
 * a direct write would desynchronise stock.
 */
export const { metadata, GET } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] },
  },
  orm: {
    entity: AnterStockAllocation,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterStockAllocationListSchema,
    entityId: ENTITY_ID,
    fields: [
      'id', 'order_line_id', 'stock_item_id', 'quantity', 'status',
      'organization_id', 'tenant_id', 'updated_at',
    ],
    sortFieldMap: {
      id: 'id',
      order_line_id: 'order_line_id',
      created_at: 'created_at',
    },
    buildFilters: async (query: StockAllocationListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.orderLineId) filters.order_line_id = query.orderLineId
      if (query.orderLineIds?.length) filters.order_line_id = { $in: query.orderLineIds }
      if (query.status) filters.status = query.status
      return filters
    },
  },
})
