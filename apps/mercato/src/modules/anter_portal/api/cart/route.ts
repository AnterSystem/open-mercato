import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterPortalContext } from '../../lib/portalContext'
import { buildCartResponsePayload } from '../../lib/cartResponse'
import { anterCartUpdateHeaderSchema } from '../../data/validators'
import type { AnterCartService } from '../../services/anterCartService'
import { anterPortalTag, anterPortalErrorSchema } from '../openapi'

export const metadata = {
  GET: { requireAuth: false },
  PUT: { requireAuth: false },
}

const cartLineSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productVariantId: z.string().uuid().nullable(),
  sku: z.string().nullable(),
  nameSnapshot: z.string().nullable(),
  variantSnapshot: z.record(z.string(), z.unknown()).nullable(),
  quantity: z.number(),
  unitCode: z.string().nullable(),
  listUnitPriceNet: z.number().nullable(),
  partnerUnitPriceNet: z.number().nullable(),
  discountRate: z.number(),
  currencyCode: z.string(),
})

const cartTotalsSchema = z.object({
  subtotalNetAmount: z.number(),
  discountTotalAmount: z.number(),
  shippingNetAmount: z.number(),
  taxTotalAmount: z.number(),
  grandTotalNetAmount: z.number(),
  grandTotalGrossAmount: z.number(),
})

const cartSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  currencyCode: z.string(),
  deliveryMode: z.string().nullable(),
  deliveryAddressId: z.string().uuid().nullable(),
  deliveryAddressSnapshot: z.record(z.string(), z.unknown()).nullable(),
  partnerReference: z.string().nullable(),
  notes: z.string().nullable(),
  totals: cartTotalsSchema,
  updatedAt: z.string(),
  lines: z.array(cartLineSchema),
})

export async function GET(req: Request) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.orders.view'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const anterCartService = context.container.resolve('anterCartService') as AnterCartService
  const cart = await anterCartService.getCart(
    { organizationId: context.organizationId, tenantId: context.tenantId },
    { customerEntityId: context.customerEntityId, customerUserId: context.customerUserId },
  )
  return NextResponse.json(await buildCartResponsePayload(context, cart))
}

export async function PUT(req: Request) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.orders.create'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse
  const { translate } = await resolveTranslations()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }
  const parsed = anterCartUpdateHeaderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const anterCartService = context.container.resolve('anterCartService') as AnterCartService
  try {
    const cart = await anterCartService.updateHeader(
      { organizationId: context.organizationId, tenantId: context.tenantId },
      { customerEntityId: context.customerEntityId, customerUserId: context.customerUserId },
      parsed.data,
    )
    return NextResponse.json(await buildCartResponsePayload(context, cart))
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Distributor cart',
  methods: {
    GET: {
      summary: 'Read the caller\'s active cart',
      responses: [{ status: 200, description: 'Active cart', schema: z.object({ item: cartSchema }) }],
      errors: [{ status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema }],
    },
    PUT: {
      summary: 'Set delivery mode, notes and the optional partner reference (§3.11)',
      requestBody: { contentType: 'application/json', schema: anterCartUpdateHeaderSchema },
      responses: [{ status: 200, description: 'Updated cart', schema: z.object({ item: cartSchema }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: anterPortalErrorSchema },
        { status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema },
        { status: 403, description: 'Insufficient permissions', schema: anterPortalErrorSchema },
      ],
    },
  },
}
