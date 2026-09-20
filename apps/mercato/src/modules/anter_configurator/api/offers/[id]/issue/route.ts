import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterConfiguratorCommandContext } from '../../../../lib/staffCommandContext'
import { anterConfiguratorTag } from '../../../openapi'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['anter_configurator.value'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const offerId = params.id?.trim()
  if (!offerId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_configurator.offer.issue', {
      input: { organizationId, tenantId, offerId, actorUserId: ctx.auth!.sub },
      ctx,
    })
    return NextResponse.json({ item: result })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Issue a draft offer',
  methods: {
    POST: {
      summary: 'draft → issued; assigns offer_number once (CC-4) and emits the CRM event',
      responses: [{ status: 200, description: 'Issued', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 404, description: 'Offer not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Only a draft offer can be issued', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
