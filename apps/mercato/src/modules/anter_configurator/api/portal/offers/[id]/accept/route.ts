import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { anterConfiguratorTag } from '../../../../openapi'

export const metadata = { POST: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

const bodySchema = z.object({
  deliveryMode: z.enum(['partner_warehouse', 'end_customer', 'self_collection']),
  deliveryAddressSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  partnerReference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

/**
 * Portal offer acceptance (spec §3.10, step 45). Places the order at the
 * offer's frozen prices — see `commands/offerAccept.ts` for why this path
 * never re-prices, unlike cart checkout.
 */
export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const offerId = params.id?.trim()
  if (!offerId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.offers.accept'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    const commandCtx: CommandRuntimeContext = {
      container: context.container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: context.organizationId,
      organizationIds: [context.organizationId],
      request: req,
    }
    const commandBus = context.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, { offerId: string; orderId: string; orderNumber: string }>('anter_configurator.offer.accept', {
      input: {
        organizationId: context.organizationId,
        tenantId: context.tenantId,
        offerId,
        customerUserId: context.customerUserId,
        deliveryMode: parsed.data.deliveryMode,
        deliveryAddressSnapshot: parsed.data.deliveryAddressSnapshot ?? null,
        partnerReference: parsed.data.partnerReference ?? null,
        notes: parsed.data.notes ?? null,
      },
      ctx: commandCtx,
    })
    return NextResponse.json({ item: { orderId: result.orderId, orderNumber: result.orderNumber } })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Portal: accept a configurator offer',
  methods: {
    POST: {
      summary: 'issued → accepted; places the order at the offer\'s frozen prices, no re-pricing',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Accepted', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 404, description: 'Offer not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Offer expired, incomplete, or superseded', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
