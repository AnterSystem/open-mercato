import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { AnterProject, AnterProjectElement, AnterProjectRevision } from '../../../../data/entities'
import { anterRevisionElementsReplaceSchema } from '../../../../data/validators'
import { resolveAnterConfiguratorCommandContext } from '../../../../lib/staffCommandContext'
import { replaceRevisionElements, computeBomIfCalibrated } from '../../../../lib/revisionElementsService'
import { resolveOutsidePriceListProductIds } from '../../../../lib/priceListScope'
import type { AnterPartnerTermsService } from '../../../../../anter_orders/services/anterPartnerTermsService'
import type { AnterPartnerPriceListScopeService } from '../../../../../anter_orders/services/anterPartnerPriceListScopeService'
import { anterConfiguratorTag } from '../../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] },
  PUT: { requireAuth: true, requireFeatures: ['anter_configurator.internal'] },
}

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/** The current element set, for opening the internal-mode workspace (s9). */
export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const { container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
  const em = (container.resolve('em') as EntityManager).fork()

  const revision = await em.findOne(AnterProjectRevision, { id: revisionId, organizationId, tenantId, deletedAt: null })
  if (!revision) return NextResponse.json({ error: '[internal] revision not found' }, { status: 404 })

  const elements = await em.find(AnterProjectElement, { revisionId: revision.id }, { orderBy: { sortOrder: 'asc' } })
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
      isOutsidePriceList: element.isOutsidePriceList,
    })),
  })
}

/**
 * Whole-revision element replace (spec §API Contracts Back office table).
 * Internal-mode draw: accepts products outside the partner's price list
 * (mode-based filtering is Phase H). Replaces transactionally, then
 * recomputes the BOM server-side and returns it (C4) — the client never
 * persists its own BOM numbers.
 */
export async function PUT(req: Request, routeCtx: RouteContext) {
  const { translate } = await resolveTranslations()
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) {
    return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  let body: unknown = {}
  const rawText = await req.text()
  if (rawText.trim().length) {
    try {
      body = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
  }
  const parsed = anterRevisionElementsReplaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input'), issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)

    const guardResult = await runRouteMutationGuards({
      container,
      req,
      auth: { userId: ctx.auth!.sub, tenantId, organizationId },
      input: { resourceKind: 'anter_configurator.revision', resourceId: revisionId, operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    const em = (container.resolve('em') as EntityManager).fork()
    const revision = await em.findOne(AnterProjectRevision, { id: revisionId, organizationId, tenantId, deletedAt: null })
    if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })

    enforceCommandOptimisticLock({ resourceKind: 'anter_configurator.revision', resourceId: revision.id, current: revision.updatedAt, request: req })

    if (revision.state !== 'draft') {
      return NextResponse.json({ error: 'revision_locked', reason: 'calibrated_after_submission' }, { status: 409 })
    }

    const scope = { organizationId, tenantId }
    const project = await em.findOne(AnterProject, { id: revision.projectId })
    const customerEntityId = project?.customerEntityId ?? null

    const productIds = [...new Set(parsed.data.elements.map((element) => element.productId).filter((id): id is string => !!id))]
    const outsidePriceListProductIds = await resolveOutsidePriceListProductIds({
      em,
      anterPartnerTermsService: container.resolve<AnterPartnerTermsService>('anterPartnerTermsService'),
      anterPartnerPriceListScopeService: container.resolve<AnterPartnerPriceListScopeService>('anterPartnerPriceListScopeService'),
      customerEntityId,
      productIds,
      scope,
    })

    const resolvedIds = await replaceRevisionElements(em, revision.id, parsed.data.elements, scope, outsidePriceListProductIds)

    await guardResult.runAfterSuccess()

    const bom = await computeBomIfCalibrated(container, ctx, revision, scope, 'PLN', customerEntityId)

    return NextResponse.json({ item: { revisionId: revision.id, elementCount: resolvedIds.length }, bom })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Replace a revision element set',
  methods: {
    PUT: {
      summary: 'Replaces every element on a revision transactionally and recomputes the BOM',
      requestBody: { contentType: 'application/json', schema: anterRevisionElementsReplaceSchema },
      responses: [{ status: 200, description: 'Replaced', schema: z.object({ item: z.unknown(), bom: z.unknown().nullable() }) }],
      errors: [
        { status: 404, description: 'Revision not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Revision locked (submitted) or optimistic-lock conflict', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
