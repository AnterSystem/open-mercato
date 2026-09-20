import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { AnterPlanPoint } from '../../../../../data/entities'
import { anterRevisionPointsReplaceSchema } from '../../../../../data/validators'
import { replaceRevisionPlanPoints } from '../../../../../lib/planPointsService'
import { loadOwnedRevision } from '../../../../../lib/portalOwnership'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { anterConfiguratorTag } from '../../../../openapi'

export const metadata = { GET: { requireAuth: false }, PUT: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/** Declared points and their coverage (spec §3.15, §API Contracts Portal table). */
export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    const { revision } = await loadOwnedRevision(context.em, revisionId, context)
    const points = await context.em.find(AnterPlanPoint, { revisionId: revision.id }, { orderBy: { createdAt: 'asc' } })

    return NextResponse.json({
      items: points.map((point) => ({
        id: point.id,
        pointKind: point.pointKind,
        position: point.position,
        state: point.state,
        skipReason: point.skipReason,
        coverageRadiusM: Number(point.coverageRadiusM),
      })),
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export async function PUT(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  let body: unknown = {}
  const rawText = await req.text()
  if (rawText.trim().length) {
    try {
      body = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })
    }
  }
  const parsed = anterRevisionPointsReplaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    const { revision } = await loadOwnedRevision(context.em, revisionId, context)

    const guardResult = await runRouteMutationGuards({
      container: context.container,
      req,
      auth: { userId: context.customerUserId, tenantId: context.tenantId, organizationId: context.organizationId, userFeatures: [] },
      input: { resourceKind: 'anter_configurator.revision', resourceId: revision.id, operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    enforceCommandOptimisticLock({ resourceKind: 'anter_configurator.revision', resourceId: revision.id, current: revision.updatedAt, request: req })

    if (revision.state !== 'draft') {
      return NextResponse.json({ error: 'revision_locked', reason: 'calibrated_after_submission' }, { status: 409 })
    }

    const items = await replaceRevisionPlanPoints(context.em, revision, parsed.data.points, {
      organizationId: context.organizationId,
      tenantId: context.tenantId,
    })
    await guardResult.runAfterSuccess()

    return NextResponse.json({ items })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Portal: revision plan points',
  methods: {
    GET: {
      summary: 'Declared points and their coverage',
      responses: [{ status: 200, description: 'List', schema: z.object({ items: z.array(z.unknown()) }) }],
    },
    PUT: {
      summary: 'Replaces the declared point set and recomputes coverage',
      requestBody: { contentType: 'application/json', schema: anterRevisionPointsReplaceSchema },
      responses: [{ status: 200, description: 'Replaced', schema: z.object({ items: z.array(z.unknown()) }) }],
    },
  },
}
