import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { AnterBomLine, AnterProjectRevision } from '../../../../data/entities'
import { resolveAnterConfiguratorCommandContext } from '../../../../lib/staffCommandContext'
import { anterConfiguratorTag } from '../../../openapi'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/**
 * Back-office BOM read (spec §API Contracts: "Adds `unitCostNet` and margin
 * figures ONLY with `anter_configurator.margin.view`; omits them otherwise" —
 * s12's principle: prices/cost are omitted from the JSON entirely, never
 * nulled (§3.7 rule 2), so a client cannot mistake absence for zero.
 */
export async function GET(req: Request, routeCtx: RouteContext) {
  const { translate } = await resolveTranslations()
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) {
    return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const em = (container.resolve('em') as EntityManager).fork()

    const revision = await em.findOne(AnterProjectRevision, { id: revisionId, organizationId, tenantId, deletedAt: null })
    if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })

    const lines = await em.find(AnterBomLine, { revisionId: revision.id }, { orderBy: { createdAt: 'asc' } })

    const rbac = container.resolve<RbacService>('rbacService')
    const canViewMargin = await rbac.userHasAllFeatures(
      ctx.auth!.sub,
      ['anter_configurator.margin.view'],
      { tenantId, organizationId },
    )

    const items = lines.map((line) => {
      const base = {
        id: line.id,
        productId: line.productId,
        productVariantId: line.productVariantId,
        sku: line.sku,
        nameSnapshot: line.nameSnapshot,
        origin: line.origin,
        quantity: Number(line.quantity),
        unitCode: line.unitCode,
        realisedLengthM: line.realisedLengthM != null ? Number(line.realisedLengthM) : null,
        residualLengthM: line.residualLengthM != null ? Number(line.residualLengthM) : null,
        moduleCount: line.moduleCount,
        postCount: line.postCount,
        anchorCount: line.anchorCount,
        listUnitPriceNet: line.listUnitPriceNet != null ? Number(line.listUnitPriceNet) : null,
        partnerUnitPriceNet: line.partnerUnitPriceNet != null ? Number(line.partnerUnitPriceNet) : null,
        discountRate: line.discountRate != null ? Number(line.discountRate) : null,
        priceState: line.priceState,
        netAmount: line.netAmount != null ? Number(line.netAmount) : null,
      }
      if (!canViewMargin) return base
      const unitCostNet = line.unitCostNet != null ? Number(line.unitCostNet) : null
      return {
        ...base,
        unitCostNet,
        marginAtListNet: unitCostNet != null && base.listUnitPriceNet != null
          ? Math.round((base.listUnitPriceNet - unitCostNet) * base.quantity * 10000) / 10000
          : null,
        marginAfterDiscountNet: unitCostNet != null && base.partnerUnitPriceNet != null
          ? Math.round((base.partnerUnitPriceNet - unitCostNet) * base.quantity * 10000) / 10000
          : null,
      }
    })

    return NextResponse.json({
      item: {
        revisionId: revision.id,
        bomComputedAt: revision.bomComputedAt ? revision.bomComputedAt.toISOString() : null,
        bomTotalNetAmount: revision.bomTotalNetAmount != null ? Number(revision.bomTotalNetAmount) : null,
        bomCurrencyCode: revision.bomCurrencyCode,
        hasUnpricedItems: revision.hasUnpricedItems,
        lines: items,
      },
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Read a revision BOM',
  methods: {
    GET: {
      summary: 'Server-authoritative BOM for a revision. Cost/margin fields present only with anter_configurator.margin.view',
      responses: [{ status: 200, description: 'BOM', schema: z.object({ item: z.unknown() }) }],
      errors: [{ status: 404, description: 'Revision not found', schema: z.object({ error: z.string() }) }],
    },
  },
}
