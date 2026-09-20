import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterPartnerPriceListScope } from '../../data/entities'
import { anterPartnerPriceListScopeSetSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] },
  PUT: { requireAuth: true, requireFeatures: ['anter_orders.terms.manage'] },
}

/**
 * Configurator spec X3: `anter_partner_price_list_scope` carries only
 * exclusions — no rows means every category is included. Read/write the
 * whole exclusion set for one partner in a single call, matching how the
 * s17 editor presents it (checkboxes over the full category tree).
 */
export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return NextResponse.json({ error: '[internal] unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const partnerTermsId = url.searchParams.get('partnerTermsId')
  if (!partnerTermsId) return NextResponse.json({ error: '[internal] partnerTermsId is required' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId
  if (!organizationId) return NextResponse.json({ error: '[internal] organization context is required' }, { status: 400 })

  const em = container.resolve('em') as EntityManager
  const rows = await em.find(AnterPartnerPriceListScope, {
    partnerTermsId,
    organizationId,
    tenantId: auth.tenantId,
  })

  return NextResponse.json({ item: { partnerTermsId, excludedCategoryIds: rows.map((row) => row.catalogCategoryId) } })
}

export async function PUT(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return NextResponse.json({ error: '[internal] unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = anterPartnerPriceListScopeSetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId
  if (!organizationId) return NextResponse.json({ error: '[internal] organization context is required' }, { status: 400 })

  try {
    const em = container.resolve('em') as EntityManager
    const existing = await em.find(AnterPartnerPriceListScope, {
      partnerTermsId: parsed.data.partnerTermsId,
      organizationId,
      tenantId: auth.tenantId,
    })
    for (const row of existing) em.remove(row)
    for (const categoryId of parsed.data.excludedCategoryIds) {
      em.create(AnterPartnerPriceListScope, {
        id: randomUUID(),
        partnerTermsId: parsed.data.partnerTermsId,
        catalogCategoryId: categoryId,
        isIncluded: false,
        organizationId,
        tenantId: auth.tenantId,
      })
    }
    await em.flush()
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi = {
  tag: 'AnterOrders',
  summary: 'Partner price-list scope exclusions',
  methods: {
    GET: {
      summary: 'The categories excluded from this partner\'s price list (X3)',
      responses: [{ status: 200, description: 'Excluded category ids', schema: z.object({ item: z.object({ partnerTermsId: z.string().uuid(), excludedCategoryIds: z.array(z.string().uuid()) }) }) }],
    },
    PUT: {
      summary: 'Replaces the whole exclusion set for a partner',
      requestBody: { contentType: 'application/json', schema: anterPartnerPriceListScopeSetSchema },
      responses: [{ status: 200, description: 'Replaced', schema: z.object({ ok: z.literal(true) }) }],
    },
  },
}
