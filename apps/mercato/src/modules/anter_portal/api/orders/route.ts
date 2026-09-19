import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveAnterPortalContext } from '../../lib/portalContext'
import type { AnterOrderReadService } from '../../../anter_orders/services/anterOrderReadService'
import { anterPortalTag, anterPortalErrorSchema } from '../openapi'

export const metadata = { GET: { requireAuth: false } }

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const orderLineSchema = z.object({
  id: z.string().uuid(),
  lineNumber: z.number(),
  productId: z.string().uuid(),
  productVariantId: z.string().uuid().nullable(),
  sku: z.string().nullable(),
  nameSnapshot: z.string(),
  quantity: z.number(),
  unitCode: z.string().nullable(),
  unitPriceNet: z.number(),
  taxRate: z.number(),
  netAmount: z.number(),
  grossAmount: z.number(),
  fulfilmentMode: z.string(),
  lineStatus: z.string(),
  shippedQuantity: z.number(),
  expectedAt: z.string().nullable(),
})

const orderSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  status: z.string(),
  currencyCode: z.string(),
  deliveryMode: z.string(),
  deliveryAddressSnapshot: z.record(z.string(), z.unknown()).nullable(),
  subtotalNetAmount: z.number(),
  discountTotalAmount: z.number(),
  shippingNetAmount: z.number(),
  taxTotalAmount: z.number(),
  grandTotalNetAmount: z.number(),
  grandTotalGrossAmount: z.number(),
  partnerReference: z.string().nullable(),
  notes: z.string().nullable(),
  placedAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  updatedAt: z.string(),
  lines: z.array(orderLineSchema),
})

export async function GET(req: Request) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.orders.view'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const url = new URL(req.url)
  const query = querySchema.parse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
  })

  const anterOrderReadService = context.container.resolve('anterOrderReadService') as AnterOrderReadService
  const result = await anterOrderReadService.listForPartner(
    { organizationId: context.organizationId, tenantId: context.tenantId },
    context.customerEntityId,
    query,
  )
  return NextResponse.json(result)
}

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Distributor order list',
  methods: {
    GET: {
      summary: 'List orders placed by the caller\'s partner (§s15)',
      query: querySchema,
      responses: [{ status: 200, description: 'Paged orders', schema: z.object({ items: z.array(orderSchema), total: z.number(), page: z.number(), pageSize: z.number() }) }],
      errors: [{ status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema }],
    },
  },
}
