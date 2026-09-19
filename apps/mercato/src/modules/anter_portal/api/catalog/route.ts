import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { resolveAnterPortalContext } from '../../lib/portalContext'
import { anterCatalogListQuerySchema } from '../../data/validators'
import type { AnterCatalogService } from '../../services/anterCatalogService'
import { anterPortalTag, anterPortalErrorSchema } from '../openapi'

export const metadata = { GET: { requireAuth: false } }

const availabilitySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('in_stock') }),
  z.object({ status: z.literal('expected'), expectedRestockAt: z.string().nullable() }),
  z.object({ status: z.literal('quote_only') }),
])

const catalogItemSchema = z.object({
  productId: z.string().uuid(),
  title: z.string(),
  sku: z.string().nullable(),
  currencyCode: z.string(),
  listUnitPriceNet: z.number().nullable(),
  partnerUnitPriceNet: z.number().nullable(),
  discountRate: z.number().nullable(),
  availability: availabilitySchema,
})

const catalogListResponseSchema = z.object({
  items: z.array(catalogItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export async function GET(req: Request) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.catalog.view'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse
  const { translate } = await resolveTranslations()

  const url = new URL(req.url)
  const query = anterCatalogListQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    categoryId: url.searchParams.get('categoryId') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
  })
  if (!query.success) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const anterCatalogService = context.container.resolve('anterCatalogService') as AnterCatalogService
  const result = await anterCatalogService.listCatalog(
    { organizationId: context.organizationId, tenantId: context.tenantId, customerId: context.customerEntityId },
    query.data,
  )
  return NextResponse.json(result)
}

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Distributor catalogue',
  methods: {
    GET: {
      summary: 'List catalogue items at the caller partner\'s contract price',
      query: anterCatalogListQuerySchema,
      responses: [
        { status: 200, description: 'Paged catalogue items', schema: catalogListResponseSchema },
      ],
      errors: [
        { status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema },
        { status: 403, description: 'Insufficient permissions', schema: anterPortalErrorSchema },
      ],
    },
  },
}
