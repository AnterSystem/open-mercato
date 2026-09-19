import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { CatalogPricingService } from '@open-mercato/core/modules/catalog/services/catalogPricingService'
import { resolveAnterPortalContext } from '../../lib/portalContext'
import { anterCheckoutSchema } from '../../data/validators'
import { createAnterCheckoutService } from '../../services/anterCheckoutService'
import type { AnterPartnerTermsService } from '../../../anter_orders/services/anterPartnerTermsService'
import { anterPortalTag, anterPortalErrorSchema } from '../openapi'

export const metadata = { POST: { requireAuth: false } }

export async function POST(req: Request) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.orders.create'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse
  const { translate } = await resolveTranslations()

  let body: unknown = {}
  const rawText = await req.text()
  if (rawText.trim().length) {
    try {
      body = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
  }
  const parsed = anterCheckoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  // §API Contracts: "Custom write routes run the mutation guard registry" —
  // POST /checkout is a non-`makeCrudRoute` write, so it must run the same
  // guard set (incl. optimistic-lock) a CRUD write would, not just its own
  // service-level checks.
  const guardResult = await runRouteMutationGuards({
    container: context.container,
    req,
    auth: { userId: context.customerUserId, tenantId: context.tenantId, organizationId: context.organizationId, userFeatures: [] },
    input: { resourceKind: 'anter_orders.order', operation: 'create' },
  })
  if (!guardResult.ok) return guardResult.response

  const anterPartnerTermsService = context.container.resolve('anterPartnerTermsService') as AnterPartnerTermsService
  const catalogPricingService = context.container.resolve('catalogPricingService') as CatalogPricingService
  const checkoutService = createAnterCheckoutService({
    em: context.em,
    container: context.container,
    catalogPricingService,
    anterPartnerTermsService,
  })

  try {
    const result = await checkoutService.placeOrder(
      { organizationId: context.organizationId, tenantId: context.tenantId },
      { customerEntityId: context.customerEntityId, customerUserId: context.customerUserId },
      req,
      parsed.data,
    )
    await guardResult.runAfterSuccess()
    return NextResponse.json({ item: result }, { status: 201 })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

const checkoutResultSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  status: z.string(),
  grandTotalNetAmount: z.number(),
  grandTotalGrossAmount: z.number(),
})

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Place an order from the active cart',
  methods: {
    POST: {
      summary: 'Re-prices every cart line, then places the order (§3.3)',
      requestBody: { contentType: 'application/json', schema: anterCheckoutSchema },
      responses: [{ status: 201, description: 'Order placed', schema: z.object({ item: checkoutResultSchema }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: anterPortalErrorSchema },
        { status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema },
        { status: 403, description: 'Account is blocked from ordering', schema: anterPortalErrorSchema },
        { status: 409, description: 'Prices changed since the cart was filled, or the cart was modified since it was last read', schema: anterPortalErrorSchema },
        { status: 422, description: 'Cart is empty, missing a delivery mode, or contains a line that is no longer orderable', schema: anterPortalErrorSchema },
      ],
    },
  },
}
