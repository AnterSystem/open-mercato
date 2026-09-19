import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterPortalContext } from '../../../lib/portalContext'
import { buildCartResponsePayload } from '../../../lib/cartResponse'
import { anterCartAddLineSchema } from '../../../data/validators'
import type { AnterCartService } from '../../../services/anterCartService'
import { anterPortalTag, anterPortalErrorSchema } from '../../openapi'

export const metadata = { POST: { requireAuth: false } }

export async function POST(req: Request) {
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
  const parsed = anterCartAddLineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const anterCartService = context.container.resolve('anterCartService') as AnterCartService
  try {
    const cart = await anterCartService.addLine(
      { organizationId: context.organizationId, tenantId: context.tenantId },
      { customerEntityId: context.customerEntityId, customerUserId: context.customerUserId },
      parsed.data,
    )
    return NextResponse.json(await buildCartResponsePayload(context, cart), { status: 201 })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Distributor cart lines',
  methods: {
    POST: {
      summary: 'Add a catalogue item to the cart. Rejects quote_only items (CC-5) and over-available quantities (D13)',
      requestBody: { contentType: 'application/json', schema: anterCartAddLineSchema },
      responses: [{ status: 201, description: 'Updated cart', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: anterPortalErrorSchema },
        { status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema },
        { status: 404, description: 'Product/variant not found', schema: anterPortalErrorSchema },
        { status: 409, description: 'Not enough stock available', schema: anterPortalErrorSchema },
        { status: 422, description: 'Item is quote-only and cannot be added', schema: anterPortalErrorSchema },
      ],
    },
  },
}
