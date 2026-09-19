import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { resolveAnterOrdersCommandContext } from '../../../../lib/staffCommandContext'
import { anterShipmentDispatchCommandSchema } from '../../../../data/validators'
import { anterOrdersTag, anterOrdersOkSchema } from '../../../openapi'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['anter_orders.release'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

export async function POST(req: Request, routeCtx: RouteContext) {
  const { translate } = await resolveTranslations()
  const params = await routeCtx.params
  const shipmentId = params.id?.trim()
  if (!shipmentId) {
    return NextResponse.json({ error: translate('anter_orders.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = anterShipmentDispatchCommandSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_orders.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterOrdersCommandContext(req)

    const guardResult = await runRouteMutationGuards({
      container,
      req,
      auth: { userId: ctx.auth!.sub, tenantId, organizationId },
      input: { resourceKind: 'anter_orders.shipment', resourceId: shipmentId, operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_orders.shipment.dispatch', {
      input: { organizationId, tenantId, shipmentId, ...parsed.data },
      ctx,
    })
    await guardResult.runAfterSuccess()
    return NextResponse.json({ item: result })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterOrdersTag,
  summary: 'Dispatch a shipment',
  methods: {
    POST: {
      summary: 'Records carrier, tracking number and dispatch date',
      requestBody: { contentType: 'application/json', schema: anterShipmentDispatchCommandSchema },
      responses: [{ status: 200, description: 'Dispatched', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 404, description: 'Shipment not found', schema: anterOrdersOkSchema },
        { status: 409, description: 'Concurrent edit', schema: anterOrdersOkSchema },
        { status: 422, description: 'Shipment is not in a dispatchable status', schema: anterOrdersOkSchema },
      ],
    },
  },
}
