import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterConfiguratorCommandContext } from '../../../../lib/staffCommandContext'
import { anterConfiguratorTag } from '../../../openapi'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['anter_configurator.value'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

const bodySchema = z.object({ unitPriceNet: z.coerce.number().min(0) })

export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const customItemId = params.id?.trim()
  if (!customItemId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_configurator.custom_item.price', {
      input: { organizationId, tenantId, customItemId, actorUserId: ctx.auth!.sub, unitPriceNet: parsed.data.unitPriceNet },
      ctx,
    })
    return NextResponse.json({ item: result })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Price a custom (CC-5) item by hand',
  methods: {
    POST: {
      summary: 'awaiting → priced; clears the revision has_unpriced_items flag only when nothing else is outstanding',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Priced', schema: z.object({ item: z.unknown() }) }],
      errors: [{ status: 404, description: 'Custom item not found', schema: z.object({ error: z.string() }) }],
    },
  },
}
