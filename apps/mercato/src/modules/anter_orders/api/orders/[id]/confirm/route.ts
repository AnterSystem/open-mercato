import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { resolveAnterOrdersCommandContext } from '../../../../lib/staffCommandContext'
import { anterOrdersTag, anterOrdersOkSchema } from '../../../openapi'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['anter_orders.manage'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

const bodySchema = z.object({ shippingNetAmount: z.coerce.number().min(0).optional() })

export async function POST(req: Request, routeCtx: RouteContext) {
  const { translate } = await resolveTranslations()
  const params = await routeCtx.params
  const orderId = params.id?.trim()
  if (!orderId) {
    return NextResponse.json({ error: translate('anter_orders.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  let body: unknown = {}
  const rawText = await req.text()
  if (rawText.trim().length) {
    try {
      body = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: translate('anter_orders.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_orders.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterOrdersCommandContext(req)

    const guardResult = await runRouteMutationGuards({
      container,
      req,
      auth: { userId: ctx.auth!.sub, tenantId, organizationId },
      input: { resourceKind: 'anter_orders.order', resourceId: orderId, operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_orders.order.confirm', {
      input: { organizationId, tenantId, orderId, shippingNetAmount: parsed.data.shippingNetAmount },
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
  summary: 'Confirm an order',
  methods: {
    POST: {
      summary: 'placed/awaiting_stock → confirmed; optionally sets the final shipping cost',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Confirmed', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: anterOrdersOkSchema },
        { status: 404, description: 'Order not found', schema: anterOrdersOkSchema },
        { status: 409, description: 'Concurrent edit', schema: anterOrdersOkSchema },
        { status: 422, description: 'Order is not in a confirmable status', schema: anterOrdersOkSchema },
      ],
    },
  },
}
