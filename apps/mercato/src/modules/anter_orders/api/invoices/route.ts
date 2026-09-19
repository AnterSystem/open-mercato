import { NextResponse } from 'next/server'
import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { AnterInvoice } from '../../data/entities'
import { anterInvoiceListSchema, anterInvoiceRecordCommandSchema } from '../../data/validators'
import { resolveAnterOrdersCommandContext } from '../../lib/staffCommandContext'

const ENTITY_ID = 'anter_orders:anter_invoice' as const

type InvoiceListQuery = z.infer<typeof anterInvoiceListSchema>

const crudRoute = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] },
  },
  orm: {
    entity: AnterInvoice,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterInvoiceListSchema,
    entityId: ENTITY_ID,
    fields: ['id', 'order_id', 'invoice_number', 'issued_at', 'net_amount', 'gross_amount', 'currency_code', 'attachment_id', 'organization_id', 'tenant_id', 'updated_at'],
    sortFieldMap: { id: 'id', order_id: 'order_id', issued_at: 'issued_at', created_at: 'created_at' },
    buildFilters: async (query: InvoiceListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.orderId) filters.order_id = query.orderId
      return filters
    },
  },
})

export const GET = crudRoute.GET

/**
 * D8: `anter_orders.invoice.record`. A bespoke POST, not the factory's
 * `create` block — recording an invoice validates the attachment (when
 * present) and is a business event, not a bare row insert.
 */
export async function POST(req: Request) {
  const { translate } = await resolveTranslations()
  const body = await req.json().catch(() => null)
  const parsed = anterInvoiceRecordCommandSchema.safeParse(body)
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
    const { result } = await commandBus.execute('anter_orders.invoice.record', {
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
  POST: { requireAuth: true, requireFeatures: ['anter_orders.manage'] },
}
