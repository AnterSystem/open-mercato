import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { loadOwnedRevision } from '../../../../../lib/portalOwnership'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { requirePortalConfiguratorMode } from '../../../../../lib/mode'
import { emitAnterConfiguratorEvent } from '../../../../../events'
import { anterConfiguratorTag } from '../../../../openapi'

export const metadata = { POST: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

type SubmissionCreateResult = { submissionId: string; submissionNumber: string; track: string; dueAt: string }

/**
 * No-price track: configuration → quote request (spec §API Contracts Portal
 * table, Implementation Plan Phase H step 29, §3.9). Only meaningful for a
 * `partner_unpriced` caller — a priced configuration goes through
 * `add-to-cart` instead, and the two never overlap in Phase H (a priced
 * configuration with unpriced custom items is Phase J scope).
 */
export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const modeOrResponse = await requirePortalConfiguratorMode(context)
  if (modeOrResponse instanceof Response) return modeOrResponse
  if (modeOrResponse.mode !== 'partner_unpriced') {
    return NextResponse.json({ error: '[internal] quote-request is only available for a no-price account' }, { status: 422 })
  }

  try {
    const { revision, project } = await loadOwnedRevision(context.em, revisionId, context)

    const guardResult = await runRouteMutationGuards({
      container: context.container,
      req,
      auth: { userId: context.customerUserId, tenantId: context.tenantId, organizationId: context.organizationId, userFeatures: [] },
      input: { resourceKind: 'anter_configurator.submission', operation: 'create' },
    })
    if (!guardResult.ok) return guardResult.response

    const commandBus = context.container.resolve<CommandBus>('commandBus')
    const commandCtx = {
      container: context.container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: context.organizationId,
      organizationIds: [context.organizationId],
      request: req,
    }
    const { result } = await commandBus.execute<unknown, SubmissionCreateResult>('anter_configurator.submission.create', {
      input: {
        organizationId: context.organizationId,
        tenantId: context.tenantId,
        projectId: project.id,
        revisionId: revision.id,
        customerEntityId: context.customerEntityId,
        track: 'unpriced',
      },
      ctx: commandCtx,
    })

    await guardResult.runAfterSuccess()

    await emitAnterConfiguratorEvent('anter_configurator.quote_request.sent', {
      submissionId: result.submissionId,
      submissionNumber: result.submissionNumber,
      projectId: project.id,
      revisionId: revision.id,
      customerEntityId: context.customerEntityId,
    }, {
      persistent: true,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
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
  summary: 'Portal: send a quote request',
  methods: {
    POST: {
      summary: 'Creates an unpriced-track submission and emits quote_request.sent',
      responses: [{ status: 200, description: 'Submitted', schema: z.object({ item: z.unknown() }) }],
      errors: [
        { status: 404, description: 'Revision not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Revision already submitted', schema: z.object({ error: z.string() }) },
        { status: 422, description: 'Not a no-price account', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
