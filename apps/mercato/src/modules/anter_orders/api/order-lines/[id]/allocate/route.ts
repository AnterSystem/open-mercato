import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { resolveAnterOrdersCommandContext } from '../../../../lib/staffCommandContext'
import { anterOrdersTag, anterOrdersOkSchema } from '../../../openapi'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['anter_orders.fulfil'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

export async function POST(req: Request, routeCtx: RouteContext) {
  const { translate } = await resolveTranslations()
  const params = await routeCtx.params
  const orderLineId = params.id?.trim()
  if (!orderLineId) {
    return NextResponse.json({ error: translate('anter_orders.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterOrdersCommandContext(req)

    const guardResult = await runRouteMutationGuards({
      container,
      req,
      auth: { userId: ctx.auth!.sub, tenantId, organizationId },
      input: { resourceKind: 'anter_orders.order', resourceId: orderLineId, operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_orders.stock.allocate', {
      input: { organizationId, tenantId, orderLineId },
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
  summary: 'Re-attempt stock allocation for one order line',
  methods: {
    POST: {
      summary: 'Allocates the line\'s remaining shortfall against current stock (e.g. after restock)',
      responses: [{ status: 200, description: 'Allocation result', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 404, description: 'Line or order not found', schema: anterOrdersOkSchema },
        { status: 409, description: 'Concurrent edit', schema: anterOrdersOkSchema },
        { status: 422, description: 'Line is not awaiting stock', schema: anterOrdersOkSchema },
      ],
    },
  },
}
