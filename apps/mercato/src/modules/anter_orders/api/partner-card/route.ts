import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { AnterPartnerTermsService } from '../../services/anterPartnerTermsService'
import type { AnterPartnerStatsService } from '../../services/anterPartnerStatsService'
import { anterOrdersTag, anterOrdersOkSchema } from '../openapi'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] } }

const querySchema = z.object({ customerEntityId: z.string().uuid() })

/**
 * Backs the `crud-form:customers.company` partner-card widget (s16) and its
 * terms-editing section (s17) — a read-only combined view of partner terms +
 * computed stats. Writes for terms go through the existing `partner-terms`
 * CRUD route (`makeCrudRoute`), not this one.
 */
export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  const url = new URL(req.url)
  const query = querySchema.safeParse({ customerEntityId: url.searchParams.get('customerEntityId') })
  if (!query.success) {
    return NextResponse.json({ error: translate('anter_orders.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.tenantId) {
    return NextResponse.json({ error: translate('anter_orders.errors.unauthorized', 'Unauthorized') }, { status: 401 })
  }
  const container = await createRequestContainer()
  const scopeResult = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scopeResult?.selectedId ?? auth.orgId ?? null
  if (!organizationId) {
    return NextResponse.json({ error: translate('anter_orders.errors.organizationRequired', 'Organization context is required') }, { status: 400 })
  }

  const scope = { organizationId, tenantId: auth.tenantId }
  const termsService = container.resolve('anterPartnerTermsService') as AnterPartnerTermsService
  const statsService = container.resolve('anterPartnerStatsService') as AnterPartnerStatsService

  const [terms, stats] = await Promise.all([
    termsService.getByCustomerEntityId(query.data.customerEntityId, scope),
    statsService.getByCustomerEntityId(query.data.customerEntityId, scope),
  ])

  return NextResponse.json({ item: { terms, stats } })
}

export const openApi: OpenApiRouteDoc = {
  tag: anterOrdersTag,
  summary: 'Partner card (terms + stats) for the CRM company page widget',
  methods: {
    GET: {
      summary: 'Combined partner terms + computed stats for one customer_entity',
      query: querySchema,
      responses: [{ status: 200, description: 'Partner card data', schema: z.object({ item: z.unknown() }) }],
      errors: [{ status: 401, description: 'Unauthorized', schema: anterOrdersOkSchema }],
    },
  },
}
