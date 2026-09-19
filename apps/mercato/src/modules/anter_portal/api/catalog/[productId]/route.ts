import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { resolveAnterPortalContext } from '../../../lib/portalContext'
import type { AnterCatalogService } from '../../../services/anterCatalogService'
import { anterPortalTag, anterPortalErrorSchema } from '../../openapi'

export const metadata = { GET: { requireAuth: false } }

type RouteParams = { productId: string }
type RouteContext = { params: Promise<RouteParams> }

const productDetailSchema = z.object({
  productId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  sku: z.string().nullable(),
  variants: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string(),
    variantName: z.string().nullable(),
    title: z.string(),
    sku: z.string().nullable(),
    currencyCode: z.string(),
    listUnitPriceNet: z.number().nullable(),
    partnerUnitPriceNet: z.number().nullable(),
    discountRate: z.number().nullable(),
    availability: z.union([
      z.object({ status: z.literal('in_stock') }),
      z.object({ status: z.literal('expected'), expectedRestockAt: z.string().nullable() }),
      z.object({ status: z.literal('quote_only') }),
    ]),
  })),
})

export async function GET(req: Request, ctx: RouteContext) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.catalog.view'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse
  const { translate } = await resolveTranslations()

  const params = await ctx.params
  const productId = params.productId?.trim()
  if (!productId) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const anterCatalogService = context.container.resolve('anterCatalogService') as AnterCatalogService
  const detail = await anterCatalogService.getCatalogProduct(
    { organizationId: context.organizationId, tenantId: context.tenantId, customerId: context.customerEntityId },
    productId,
  )
  if (!detail) {
    return NextResponse.json({ error: translate('anter_portal.errors.notFound', 'Not found') }, { status: 404 })
  }
  return NextResponse.json({ item: detail })
}

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Distributor catalogue product detail',
  methods: {
    GET: {
      summary: 'Variants with per-variant price and availability',
      responses: [
        { status: 200, description: 'Product detail', schema: z.object({ item: productDetailSchema }) },
      ],
      errors: [
        { status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema },
        { status: 404, description: 'Not found', schema: anterPortalErrorSchema },
      ],
    },
  },
}
