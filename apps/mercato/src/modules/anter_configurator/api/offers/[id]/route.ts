import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterOffer, AnterOfferLine } from '../../../data/entities'
import { resolveAnterConfiguratorCommandContext } from '../../../lib/staffCommandContext'
import { anterConfiguratorTag } from '../../openapi'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const offerId = params.id?.trim()
  if (!offerId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  try {
    const { container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const em = (container.resolve('em') as EntityManager).fork()

    const offer = await em.findOne(AnterOffer, { id: offerId, organizationId, tenantId, deletedAt: null })
    if (!offer) throw new CrudHttpError(404, { error: '[internal] offer not found' })
    const lines = await em.find(AnterOfferLine, { offerId: offer.id }, { orderBy: { lineNumber: 'asc' } })

    return NextResponse.json({
      item: {
        id: offer.id,
        offerNumber: offer.offerNumber ?? null,
        submissionId: offer.submissionId ?? null,
        projectId: offer.projectId,
        revisionId: offer.revisionId,
        customerEntityId: offer.customerEntityId ?? null,
        customerDealId: offer.customerDealId ?? null,
        status: offer.status,
        currencyCode: offer.currencyCode,
        validUntil: offer.validUntil,
        isIncomplete: offer.isIncomplete,
        incompleteReason: offer.incompleteReason ?? null,
        subtotalNetAmount: Number(offer.subtotalNetAmount),
        discountTotalAmount: Number(offer.discountTotalAmount),
        shippingNetAmount: Number(offer.shippingNetAmount),
        taxTotalAmount: Number(offer.taxTotalAmount),
        grandTotalNetAmount: Number(offer.grandTotalNetAmount),
        grandTotalGrossAmount: Number(offer.grandTotalGrossAmount),
        deliveryTerms: offer.deliveryTerms ?? null,
        paymentTermsText: offer.paymentTermsText ?? null,
        leadTimeText: offer.leadTimeText ?? null,
        issuedAt: offer.issuedAt ? offer.issuedAt.toISOString() : null,
        acceptedAt: offer.acceptedAt ? offer.acceptedAt.toISOString() : null,
        updatedAt: offer.updatedAt.toISOString(),
        lines: lines.map((line) => ({
          id: line.id,
          lineNumber: line.lineNumber,
          productId: line.productId ?? null,
          sku: line.sku ?? null,
          nameSnapshot: line.nameSnapshot,
          quantity: Number(line.quantity),
          unitCode: line.unitCode,
          listUnitPriceNet: line.listUnitPriceNet != null ? Number(line.listUnitPriceNet) : null,
          unitPriceNet: line.unitPriceNet != null ? Number(line.unitPriceNet) : null,
          netAmount: line.netAmount != null ? Number(line.netAmount) : null,
          grossAmount: line.grossAmount != null ? Number(line.grossAmount) : null,
          isAwaitingValuation: line.isAwaitingValuation,
        })),
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
  summary: 'Read an Anter configurator offer',
  methods: {
    GET: {
      summary: 'Offer header plus its lines, including any still awaiting valuation',
      responses: [{ status: 200, description: 'Offer', schema: z.object({ item: z.unknown() }) }],
      errors: [{ status: 404, description: 'Offer not found', schema: z.object({ error: z.string() }) }],
    },
  },
}
