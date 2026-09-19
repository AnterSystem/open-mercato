import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { resolveAnterPortalContext } from '../../../lib/portalContext'
import type { AnterOrderReadService } from '../../../../anter_orders/services/anterOrderReadService'
import { anterPortalTag, anterPortalErrorSchema } from '../../openapi'

export const metadata = { GET: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

export async function GET(req: Request, ctx: RouteContext) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.orders.view'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse
  const { translate } = await resolveTranslations()

  const params = await ctx.params
  const orderId = params.id?.trim()
  if (!orderId) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const anterOrderReadService = context.container.resolve('anterOrderReadService') as AnterOrderReadService
  // Scoped to the caller's own customerEntityId (§3.10) — another partner's
  // order id is invisible, so this is a 404, never a 403 (§API Contracts).
  const order = await anterOrderReadService.getForPartner(
    { organizationId: context.organizationId, tenantId: context.tenantId },
    context.customerEntityId,
    orderId,
  )
  if (!order) {
    return NextResponse.json({ error: translate('anter_portal.errors.notFound', 'Not found') }, { status: 404 })
  }
  return NextResponse.json({ item: order })
}

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Distributor order detail',
  methods: {
    GET: {
      summary: 'Order detail with per-line status (§s38/s39)',
      responses: [{ status: 200, description: 'Order', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema },
        { status: 404, description: 'Not found', schema: anterPortalErrorSchema },
      ],
    },
  },
}
