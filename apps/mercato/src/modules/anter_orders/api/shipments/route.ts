import { NextResponse } from 'next/server'
import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { AnterShipment } from '../../data/entities'
import { anterShipmentListSchema, anterShipmentCreateCommandSchema } from '../../data/validators'
import { resolveAnterOrdersCommandContext } from '../../lib/staffCommandContext'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

const ENTITY_ID = 'anter_orders:anter_shipment' as const

type ShipmentListQuery = z.infer<typeof anterShipmentListSchema>

const crudRoute = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] },
  },
  orm: {
    entity: AnterShipment,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterShipmentListSchema,
    entityId: ENTITY_ID,
    fields: [
      'id', 'order_id', 'shipment_number', 'sequence_number', 'status', 'carrier_name',
      'tracking_number', 'weight_kg', 'package_count', 'shipping_cost_net', 'dispatched_at',
      'delivered_at', 'organization_id', 'tenant_id', 'updated_at',
    ],
    sortFieldMap: { id: 'id', order_id: 'order_id', sequence_number: 'sequence_number', created_at: 'created_at' },
    buildFilters: async (query: ShipmentListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.orderId) filters.order_id = query.orderId
      if (query.status) filters.status = query.status
      return filters
    },
  },
})

export const GET = crudRoute.GET

/**
 * `anter_orders.shipment.create` (s41). A bespoke POST rather than the
 * factory's `create` block — creating a shipment recomputes allocations and
 * order/line status through the command, which a generic CRUD insert would
 * bypass (same reasoning as `orders/route.ts` and `order-lines/route.ts`).
 */
export async function POST(req: Request) {
  const { translate } = await resolveTranslations()
  const body = await req.json().catch(() => null)
  const parsed = anterShipmentCreateCommandSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_orders.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterOrdersCommandContext(req)

    const guardResult = await runRouteMutationGuards({
      container,
      req,
      auth: { userId: ctx.auth!.sub, tenantId, organizationId },
      input: { resourceKind: 'anter_orders.order', resourceId: parsed.data.orderId, operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_orders.shipment.create', {
      input: { organizationId, tenantId, ...parsed.data },
      ctx,
    })
    await guardResult.runAfterSuccess()
    return NextResponse.json({ item: result }, { status: 201 })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const metadata = {
  ...crudRoute.metadata,
  POST: { requireAuth: true, requireFeatures: ['anter_orders.release'] },
}
