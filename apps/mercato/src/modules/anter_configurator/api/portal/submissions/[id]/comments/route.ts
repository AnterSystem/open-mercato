import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { loadOwnedSubmission } from '../../../../../lib/portalOwnership'
import { anterConfiguratorTag } from '../../../../openapi'

export const metadata = { POST: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000), elementId: z.string().uuid().nullable().optional() })

/**
 * Portal comment reply — always `visibility: 'shared'`; a partner has no way
 * to write `internal`, at the schema level, not merely by omission in the UI.
 */
export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const submissionId = params.id?.trim()
  if (!submissionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    await loadOwnedSubmission(context.em, submissionId, context)

    const commandCtx: CommandRuntimeContext = {
      container: context.container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: context.organizationId,
      organizationIds: [context.organizationId],
      request: req,
    }
    const commandBus = context.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_configurator.submission.comment_add', {
      input: {
        organizationId: context.organizationId,
        tenantId: context.tenantId,
        submissionId,
        elementId: parsed.data.elementId ?? null,
        authorCustomerUserId: context.customerUserId,
        body: parsed.data.body,
        visibility: 'shared',
      },
      ctx: commandCtx,
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
  summary: 'Portal: comment on one of my configurator submissions',
  methods: {
    POST: {
      summary: 'Always visibility: shared',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ item: z.unknown() }) }],
    },
  },
}
