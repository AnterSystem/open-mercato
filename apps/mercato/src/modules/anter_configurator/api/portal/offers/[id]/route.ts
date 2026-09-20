import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterOffer, AnterOfferLine, AnterProject, AnterProjectRevision } from '../../../../data/entities'
import { resolveAnterConfiguratorPortalContext } from '../../../../lib/portalContext'
import { anterConfiguratorTag } from '../../../openapi'

export const metadata = { GET: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

const VISIBLE_STATUSES = ['issued', 'accepted', 'expired', 'superseded']

export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const offerId = params.id?.trim()
  if (!offerId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.offers.view'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    const offer = await context.em.findOne(AnterOffer, {
      id: offerId,
      customerEntityId: context.customerEntityId,
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      status: { $in: VISIBLE_STATUSES },
      deletedAt: null,
    })
    if (!offer) throw new CrudHttpError(404, { error: '[internal] offer not found' })

    const [lines, project, revision] = await Promise.all([
      context.em.find(AnterOfferLine, { offerId: offer.id }, { orderBy: { lineNumber: 'asc' } }),
      context.em.findOne(AnterProject, { id: offer.projectId }),
      context.em.findOne(AnterProjectRevision, { id: offer.revisionId }),
    ])

    return NextResponse.json({
      item: {
        id: offer.id,
        offerNumber: offer.offerNumber,
        projectName: project?.name ?? '',
        revisionLabel: revision?.revisionLabel ?? '',
        status: offer.status,
        isIncomplete: offer.isIncomplete,
        currencyCode: offer.currencyCode,
        validUntil: offer.validUntil,
        deliveryTerms: offer.deliveryTerms ?? null,
        paymentTermsText: offer.paymentTermsText ?? null,
        leadTimeText: offer.leadTimeText ?? null,
        subtotalNetAmount: Number(offer.subtotalNetAmount),
        shippingNetAmount: Number(offer.shippingNetAmount),
        taxTotalAmount: Number(offer.taxTotalAmount),
        grandTotalNetAmount: Number(offer.grandTotalNetAmount),
        grandTotalGrossAmount: Number(offer.grandTotalGrossAmount),
        issuedAt: offer.issuedAt ? offer.issuedAt.toISOString() : null,
        lines: lines.map((line) => ({
          id: line.id,
          nameSnapshot: line.nameSnapshot,
          quantity: Number(line.quantity),
          unitCode: line.unitCode,
          unitPriceNet: line.unitPriceNet != null ? Number(line.unitPriceNet) : null,
          netAmount: line.netAmount != null ? Number(line.netAmount) : null,
          isAwaitingValuation: line.isAwaitingValuation,
        })),
      },
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Portal: read one of my configurator offers',
  methods: {
    GET: {
      summary: 'issued/accepted/expired/superseded only',
      responses: [{ status: 200, description: 'Offer', schema: z.object({ item: z.unknown() }) }],
      errors: [{ status: 404, description: 'Offer not found', schema: z.object({ error: z.string() }) }],
    },
  },
}
