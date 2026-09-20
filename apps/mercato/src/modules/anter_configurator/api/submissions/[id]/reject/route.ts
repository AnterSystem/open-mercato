import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterConfiguratorCommandContext } from '../../../../lib/staffCommandContext'
import { anterConfiguratorTag } from '../../../openapi'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['anter_configurator.review'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

const bodySchema = z.object({ reason: z.string().trim().min(1).max(2000) })

export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const submissionId = params.id?.trim()
  if (!submissionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_configurator.submission.reject', {
      input: { organizationId, tenantId, submissionId, actorUserId: ctx.auth!.sub, reason: parsed.data.reason },
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
  summary: 'Reject a submission',
  methods: {
    POST: {
      summary: 'technical_review → rejected; for the priced track also puts the resulting order on technical_hold (X8)',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Rejected', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 404, description: 'Submission not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Submission is not awaiting technical review', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
