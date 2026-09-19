import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { AnterOrderLine } from '../../data/entities'
import { anterOrderLineListSchema } from '../../data/validators'

const ENTITY_ID = 'anter_orders:anter_order_line' as const

type OrderLineListQuery = z.infer<typeof anterOrderLineListSchema>

/**
 * Fulfilment view (s44) — one order line per row, GET-only for the same
 * reason `orders/route.ts` is: lines are only mutated via allocation/
 * shipment commands.
 */
export const { metadata, GET } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] },
  },
  orm: {
    entity: AnterOrderLine,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterOrderLineListSchema,
    entityId: ENTITY_ID,
    fields: [
      'id', 'order_id', 'line_number', 'product_id', 'sku', 'name_snapshot', 'quantity',
      'unit_price_net', 'net_amount', 'gross_amount', 'fulfilment_mode', 'line_status',
      'shipped_quantity', 'expected_at', 'organization_id', 'tenant_id', 'updated_at',
    ],
    sortFieldMap: {
      id: 'id',
      order_id: 'order_id',
      line_number: 'line_number',
      created_at: 'created_at',
    },
    buildFilters: async (query: OrderLineListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.orderId) filters.order_id = query.orderId
      if (query.fulfilmentMode) filters.fulfilment_mode = query.fulfilmentMode
      if (query.lineStatus) filters.line_status = query.lineStatus
      return filters
    },
  },
})
