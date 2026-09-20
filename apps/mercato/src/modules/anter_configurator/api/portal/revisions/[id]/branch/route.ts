import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { loadOwnedRevision } from '../../../../../lib/portalOwnership'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { anterConfiguratorTag } from '../../../../openapi'

export const metadata = { POST: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/**
 * The redraw path (spec Implementation Plan step 38): the partner's only way
 * to act on `revision_requested` — the submitted revision itself stays
 * immutable (§3.8), this opens a new, editable one with the old drawing
 * copied forward.
 */
export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    await loadOwnedRevision(context.em, revisionId, context)

    const commandCtx: CommandRuntimeContext = {
      container: context.container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: context.organizationId,
      organizationIds: [context.organizationId],
      request: req,
    }
    const commandBus = context.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_configurator.revision.branch', {
      input: { organizationId: context.organizationId, tenantId: context.tenantId, revisionId },
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
  summary: 'Portal: branch a new revision from an existing one (redraw)',
  methods: {
    POST: {
      summary: 'Copies the drawing forward; the previous revision goes stale',
      responses: [{ status: 201, description: 'Branched', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 404, description: 'Revision not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Cannot branch a draft revision', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
