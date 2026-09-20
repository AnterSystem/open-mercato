import { NextResponse } from 'next/server'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterBomLine } from '../../../../../data/entities'
import { loadOwnedRevision } from '../../../../../lib/portalOwnership'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'

export const metadata = { GET: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/**
 * Portal BOM read (spec §API Contracts Portal table). Cost and margin are
 * NEVER present in a portal response, in any mode (§3.7 rule 2, §Risks R6) —
 * unlike the staff route, there is no feature check here that could ever add
 * them back.
 */
export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    const { revision } = await loadOwnedRevision(context.em, revisionId, context)
    const lines = await context.em.find(AnterBomLine, { revisionId: revision.id }, { orderBy: { createdAt: 'asc' } })

    return NextResponse.json({
      item: {
        revisionId: revision.id,
        bomComputedAt: revision.bomComputedAt ? revision.bomComputedAt.toISOString() : null,
        bomTotalNetAmount: revision.bomTotalNetAmount != null ? Number(revision.bomTotalNetAmount) : null,
        bomCurrencyCode: revision.bomCurrencyCode,
        hasUnpricedItems: revision.hasUnpricedItems,
        lines: lines.map((line) => ({
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
          ...(line.priceState === 'priced'
            ? { partnerUnitPriceNet: line.partnerUnitPriceNet != null ? Number(line.partnerUnitPriceNet) : null, netAmount: line.netAmount != null ? Number(line.netAmount) : null }
            : {}),
          priceState: line.priceState,
        })),
      },
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}
