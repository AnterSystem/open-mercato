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

const bodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  elementId: z.string().uuid().nullable().optional(),
  visibility: z.enum(['shared', 'internal']).default('shared'),
})

export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const submissionId = params.id?.trim()
  if (!submissionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_configurator.submission.comment_add', {
      input: {
        organizationId,
        tenantId,
        submissionId,
        elementId: parsed.data.elementId ?? null,
        authorUserId: ctx.auth!.sub,
        body: parsed.data.body,
        visibility: parsed.data.visibility,
      },
      ctx,
    })
    return NextResponse.json({ item: result }, { status: 201 })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Add a comment to a submission',
  methods: {
    POST: {
      summary: 'Optionally anchored to one element; `internal` visibility is staff-only and never reaches the portal read',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ item: z.unknown() }) }],
    },
  },
}
