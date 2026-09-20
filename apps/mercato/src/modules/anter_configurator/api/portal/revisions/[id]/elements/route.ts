import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { AnterProjectElement } from '../../../../../data/entities'
import { anterRevisionElementsReplaceSchema } from '../../../../../data/validators'
import { replaceRevisionElements, computeBomIfCalibrated } from '../../../../../lib/revisionElementsService'
import { loadOwnedRevision } from '../../../../../lib/portalOwnership'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { requirePortalConfiguratorMode } from '../../../../../lib/mode'
import { anterConfiguratorTag } from '../../../../openapi'

export const metadata = { GET: { requireAuth: false }, PUT: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/** The current element set, for re-opening a workspace (not in the spec's API table — implied by "one page for both modes"). */
export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const modeOrResponse = await requirePortalConfiguratorMode(context)
  if (modeOrResponse instanceof Response) return modeOrResponse

  try {
    const { revision } = await loadOwnedRevision(context.em, revisionId, context)
    const elements = await context.em.find(AnterProjectElement, { revisionId: revision.id }, { orderBy: { sortOrder: 'asc' } })

    return NextResponse.json({
      items: elements.map((element) => ({
        id: element.id,
        elementKind: element.elementKind,
        productId: element.productId,
        productVariantId: element.productVariantId,
        geometry: element.geometry,
        hostElementId: element.hostElementId,
        hostOffsetRatio: element.hostOffsetRatio != null ? Number(element.hostOffsetRatio) : null,
        label: element.label,
        sortOrder: element.sortOrder,
      })),
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

/**
 * Portal counterpart of the staff element-replace route (spec §API
 * Contracts Portal table): replaces the whole element set transactionally
 * and recomputes the BOM server-side (C4), priced against THIS caller's
 * partner terms.
 */
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
  const parsed = anterRevisionElementsReplaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const modeOrResponse = await requirePortalConfiguratorMode(context)
  if (modeOrResponse instanceof Response) return modeOrResponse

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

    const scope = { organizationId: context.organizationId, tenantId: context.tenantId }
    const resolvedIds = await replaceRevisionElements(context.em, revision.id, parsed.data.elements, scope)

    await guardResult.runAfterSuccess()

    const commandCtx = {
      container: context.container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: context.organizationId,
      organizationIds: [context.organizationId],
      request: req,
    }
    const bom = await computeBomIfCalibrated(context.container, commandCtx, revision, scope, 'PLN', context.customerEntityId)

    return NextResponse.json({ item: { revisionId: revision.id, elementCount: resolvedIds.length }, bom })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Portal: replace a revision element set',
  methods: {
    PUT: {
      summary: 'Whole-revision element set, replaced transactionally. Recomputes the BOM server-side and returns it (C4)',
      requestBody: { contentType: 'application/json', schema: anterRevisionElementsReplaceSchema },
      responses: [{ status: 200, description: 'Replaced', schema: z.object({ item: z.unknown(), bom: z.unknown().nullable() }) }],
      errors: [
        { status: 404, description: 'Revision not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Revision locked or optimistic-lock conflict', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
