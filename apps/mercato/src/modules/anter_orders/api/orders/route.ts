import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { AnterOrder } from '../../data/entities'
import { anterOrderListSchema } from '../../data/validators'

const ENTITY_ID = 'anter_orders:anter_order' as const

type OrderListQuery = z.infer<typeof anterOrderListSchema>

/**
 * Back-office order read (s43/detail). Deliberately GET-only: orders are
 * created exclusively via `anter_orders.order.place` and mutated exclusively
 * via commands (`order.confirm`, `stock.allocate`, shipment/invoice commands)
 * — a generic CRUD `create`/`update` would bypass their totals/allocation/
 * numbering logic, so `create`/`update`/`del` are intentionally omitted.
 */
export const { metadata, GET } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] },
  },
  orm: {
    entity: AnterOrder,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterOrderListSchema,
    entityId: ENTITY_ID,
    fields: [
      'id', 'order_number', 'customer_entity_id', 'source', 'status', 'currency_code',
      'delivery_mode', 'partner_reference', 'grand_total_net_amount', 'grand_total_gross_amount',
      'placed_at', 'confirmed_at', 'closed_at', 'organization_id', 'tenant_id', 'updated_at',
    ],
    sortFieldMap: {
      id: 'id',
      order_number: 'order_number',
      created_at: 'created_at',
      placed_at: 'placed_at',
    },
    buildFilters: async (query: OrderListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.customerEntityId) filters.customer_entity_id = query.customerEntityId
      if (query.status) filters.status = query.status
      return filters
    },
  },
})
