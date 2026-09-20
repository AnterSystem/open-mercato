import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { AnterProjectElement, AnterProjectRevision } from '../../../../data/entities'
import { anterRevisionElementsReplaceSchema } from '../../../../data/validators'
import { resolveAnterConfiguratorCommandContext } from '../../../../lib/staffCommandContext'
import { anterConfiguratorTag } from '../../../openapi'
import type { RevisionComputeBomResult } from '../../../../commands/revisionComputeBom'

export const metadata = { PUT: { requireAuth: true, requireFeatures: ['anter_configurator.internal'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

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

    // Ids are resolved up front so an `insert` element's `hostElementId` can
    // reference either a pre-existing element or another new element in the
    // same payload.
    const resolvedIds = parsed.data.elements.map((el) => el.id ?? randomUUID())

    await withAtomicFlush(em, [
      async () => {
        const existing = await em.find(AnterProjectElement, { revisionId: revision.id })
        for (const element of existing) em.remove(element)
      },
      () => {
        parsed.data.elements.forEach((input, index) => {
          em.persist(em.create(AnterProjectElement, {
            id: resolvedIds[index],
            revisionId: revision.id,
            elementKind: input.elementKind,
            productId: input.productId ?? null,
            productVariantId: input.productVariantId ?? null,
            geometry: input.geometry,
            hostElementId: input.hostElementId ?? null,
            hostOffsetRatio: input.hostOffsetRatio != null ? String(input.hostOffsetRatio) : null,
            label: input.label ?? null,
            sortOrder: input.sortOrder,
            organizationId,
            tenantId,
          }))
        })
      },
    ], { transaction: true, label: 'anter_configurator.revision.elements.replace' })

    await guardResult.runAfterSuccess()

    let bom: RevisionComputeBomResult | null = null
    if (revision.metresPerUnit != null) {
      const commandBus = container.resolve<CommandBus>('commandBus')
      const { result } = await commandBus.execute<unknown, RevisionComputeBomResult>('anter_configurator.revision.compute_bom', {
        input: { organizationId, tenantId, revisionId: revision.id, currencyCode: 'PLN' },
        ctx,
      })
      bom = result
    }

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
