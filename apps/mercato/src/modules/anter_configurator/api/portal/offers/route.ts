import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { AnterOffer, AnterProject, AnterProjectRevision } from '../../../data/entities'
import { resolveAnterConfiguratorPortalContext } from '../../../lib/portalContext'
import { anterConfiguratorTag } from '../../openapi'

export const metadata = { GET: { requireAuth: false } }

const VISIBLE_STATUSES = ['issued', 'accepted', 'expired', 'superseded']

/**
 * Portal offer list (spec §API Contracts: "`issued`, `accepted`, `expired`,
 * `superseded` only. A `draft` offer is invisible"). Scoped to the caller's
 * `customerEntityId` from the JWT — never a request parameter (§3.14).
 */
export async function GET(req: Request) {
  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.offers.view'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const offers = await context.em.find(AnterOffer, {
    customerEntityId: context.customerEntityId,
    organizationId: context.organizationId,
    tenantId: context.tenantId,
    status: { $in: VISIBLE_STATUSES },
    deletedAt: null,
  }, { orderBy: { issuedAt: 'desc' }, limit: 100 })

  const projectIds = Array.from(new Set(offers.map((offer) => offer.projectId)))
  const revisionIds = Array.from(new Set(offers.map((offer) => offer.revisionId)))
  const [projects, revisions] = await Promise.all([
    projectIds.length ? context.em.find(AnterProject, { id: { $in: projectIds } }) : Promise.resolve([]),
    revisionIds.length ? context.em.find(AnterProjectRevision, { id: { $in: revisionIds } }) : Promise.resolve([]),
  ])
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
  const revisionLabelById = new Map(revisions.map((revision) => [revision.id, revision.revisionLabel]))

  return NextResponse.json({
    items: offers.map((offer) => ({
      id: offer.id,
      offerNumber: offer.offerNumber,
      projectId: offer.projectId,
      projectName: projectNameById.get(offer.projectId) ?? '',
      revisionId: offer.revisionId,
      revisionLabel: revisionLabelById.get(offer.revisionId) ?? '',
      status: offer.status,
      isIncomplete: offer.isIncomplete,
      currencyCode: offer.currencyCode,
      grandTotalNetAmount: Number(offer.grandTotalNetAmount),
      grandTotalGrossAmount: Number(offer.grandTotalGrossAmount),
      validUntil: offer.validUntil,
      issuedAt: offer.issuedAt ? offer.issuedAt.toISOString() : null,
    })),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Portal: list my configurator offers',
  methods: {
    GET: {
      summary: 'issued/accepted/expired/superseded only — a draft offer is invisible',
      responses: [{ status: 200, description: 'Offers', schema: z.object({ items: z.array(z.unknown()) }) }],
    },
  },
}
