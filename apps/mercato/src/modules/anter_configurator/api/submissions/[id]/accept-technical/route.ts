import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterConfiguratorCommandContext } from '../../../../lib/staffCommandContext'
import { anterConfiguratorTag } from '../../../openapi'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['anter_configurator.review'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const submissionId = params.id?.trim()
  if (!submissionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_configurator.submission.accept_technical', {
      input: { organizationId, tenantId, submissionId, actorUserId: ctx.auth!.sub },
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
  summary: 'Accept a submission technically',
  methods: {
    POST: {
      summary: 'technical_review → valuation (unpriced) or closed_order (priced); stamps the revision technical acceptance (X10)',
      responses: [{ status: 200, description: 'Accepted', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 404, description: 'Submission not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Submission is not awaiting technical review', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
