import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterPortalContext } from '../../../lib/portalContext'
import { buildCartResponsePayload } from '../../../lib/cartResponse'
import type { AnterCartService } from '../../../services/anterCartService'
import type { AnterOrderReadService } from '../../../../anter_orders/services/anterOrderReadService'
import { anterPortalTag, anterPortalErrorSchema } from '../../openapi'

export const metadata = { POST: { requireAuth: false } }

const bodySchema = z.object({ orderId: z.string().uuid() })

/**
 * "Ponów" (spec API Contracts) — copies an order's lines into the cart at
 * CURRENT prices, reusing `anterCartService.addLine`'s own re-pricing and
 * CC-5/D13 rejection logic line by line. Never places an order. Best-effort:
 * a line that's since gone quote_only or out of stock is skipped rather than
 * failing the whole reorder — the partner still gets everything reorderable.
 */
export async function POST(req: Request) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.orders.create'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse
  const { translate } = await resolveTranslations()

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const anterOrderReadService = context.container.resolve('anterOrderReadService') as AnterOrderReadService
  const order = await anterOrderReadService.getForPartner(
    { organizationId: context.organizationId, tenantId: context.tenantId },
    context.customerEntityId,
    parsed.data.orderId,
  )
  if (!order) {
    return NextResponse.json({ error: translate('anter_portal.errors.notFound', 'Not found') }, { status: 404 })
  }

  const anterCartService = context.container.resolve('anterCartService') as AnterCartService
  const scope = { organizationId: context.organizationId, tenantId: context.tenantId }
  const principal = { customerEntityId: context.customerEntityId, customerUserId: context.customerUserId }

  let cart = await anterCartService.getCart(scope, principal)
  const skippedLineIds: string[] = []
  for (const line of order.lines) {
    try {
      cart = await anterCartService.addLine(scope, principal, {
        productId: line.productId,
        productVariantId: line.productVariantId ?? null,
        quantity: line.quantity,
      }, req)
    } catch (err) {
      if (isCrudHttpError(err)) {
        skippedLineIds.push(line.id)
        continue
      }
      throw err
    }
  }

  return NextResponse.json({ ...(await buildCartResponsePayload(context, cart)), skippedLineIds })
}

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Reorder — copy an order\'s lines into the cart at current prices',
  methods: {
    POST: {
      summary: 'Never places an order. Best-effort: lines that are no longer orderable are skipped',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Updated cart', schema: z.object({ item: z.unknown(), skippedLineIds: z.array(z.string()) }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: anterPortalErrorSchema },
        { status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema },
        { status: 404, description: 'Order not found', schema: anterPortalErrorSchema },
      ],
    },
  },
}
