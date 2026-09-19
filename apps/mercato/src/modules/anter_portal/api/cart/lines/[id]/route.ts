import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterPortalContext } from '../../../../lib/portalContext'
import { buildCartResponsePayload } from '../../../../lib/cartResponse'
import { anterCartUpdateLineSchema } from '../../../../data/validators'
import type { AnterCartService } from '../../../../services/anterCartService'
import { anterPortalTag, anterPortalErrorSchema } from '../../../openapi'

export const metadata = {
  PUT: { requireAuth: false },
  DELETE: { requireAuth: false },
}

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

async function resolveLineId(ctx: RouteContext): Promise<string | null> {
  const params = await ctx.params
  const id = params.id?.trim()
  return id?.length ? id : null
}

export async function PUT(req: Request, ctx: RouteContext) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.orders.create'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse
  const { translate } = await resolveTranslations()

  const lineId = await resolveLineId(ctx)
  if (!lineId) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }
  const parsed = anterCartUpdateLineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const anterCartService = context.container.resolve('anterCartService') as AnterCartService
  try {
    const cart = await anterCartService.updateLine(
      { organizationId: context.organizationId, tenantId: context.tenantId },
      { customerEntityId: context.customerEntityId, customerUserId: context.customerUserId },
      lineId,
      parsed.data,
    )
    return NextResponse.json(await buildCartResponsePayload(context, cart))
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export async function DELETE(req: Request, ctx: RouteContext) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.orders.create'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse
  const { translate } = await resolveTranslations()

  const lineId = await resolveLineId(ctx)
  if (!lineId) {
    return NextResponse.json({ error: translate('anter_portal.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const anterCartService = context.container.resolve('anterCartService') as AnterCartService
  try {
    const cart = await anterCartService.removeLine(
      { organizationId: context.organizationId, tenantId: context.tenantId },
      { customerEntityId: context.customerEntityId, customerUserId: context.customerUserId },
      lineId,
    )
    return NextResponse.json(await buildCartResponsePayload(context, cart))
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Distributor cart line',
  methods: {
    PUT: {
      summary: 'Change a cart line\'s quantity; re-prices the line',
      requestBody: { contentType: 'application/json', schema: anterCartUpdateLineSchema },
      responses: [{ status: 200, description: 'Updated cart', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: anterPortalErrorSchema },
        { status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema },
        { status: 404, description: 'Line not found', schema: anterPortalErrorSchema },
        { status: 409, description: 'Not enough stock available', schema: anterPortalErrorSchema },
        { status: 422, description: 'Item is quote-only and cannot be ordered', schema: anterPortalErrorSchema },
      ],
    },
    DELETE: {
      summary: 'Remove a cart line',
      responses: [{ status: 200, description: 'Updated cart', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema },
        { status: 404, description: 'Line not found', schema: anterPortalErrorSchema },
      ],
    },
  },
}
