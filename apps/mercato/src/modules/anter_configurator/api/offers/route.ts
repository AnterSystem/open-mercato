import { NextResponse } from 'next/server'
import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterOffer } from '../../data/entities'
import { anterOfferListSchema } from '../../data/validators'
import { resolveAnterConfiguratorCommandContext } from '../../lib/staffCommandContext'
import { createAnterConfiguratorCrudOpenApi, createAnterConfiguratorPagedListResponseSchema, anterConfiguratorCreatedSchema } from '../openapi'

const ENTITY_ID = 'anter_configurator:anter_offer' as const

type OfferListQuery = z.infer<typeof anterOfferListSchema>

const offerListItemSchema = z.object({
  id: z.string().uuid(),
  offer_number: z.string().nullable().optional(),
  project_id: z.string().uuid(),
  revision_id: z.string().uuid(),
  customer_entity_id: z.string().uuid().nullable().optional(),
  status: z.string(),
  is_incomplete: z.boolean(),
  currency_code: z.string(),
  grand_total_net_amount: z.string(),
  grand_total_gross_amount: z.string(),
  valid_until: z.string(),
  updatedAt: z.string().nullable().optional(),
})

const buildBodySchema = z.object({
  revisionId: z.string().uuid(),
  submissionId: z.string().uuid().nullable().optional(),
  validUntilDays: z.coerce.number().int().min(1).optional(),
  shippingNetAmount: z.coerce.number().min(0).optional(),
  deliveryTerms: z.string().trim().max(2000).nullable().optional(),
  paymentTermsText: z.string().trim().max(2000).nullable().optional(),
  leadTimeText: z.string().trim().max(2000).nullable().optional(),
})

/**
 * Back-office offer list (GET, standard CRUD) and offer creation (POST,
 * spec §API Contracts `anter_configurator.offer.build`, step 42/43). GET-only
 * CRUD by design — like `anter_orders`' own orders route, offers are
 * created/mutated exclusively through commands so totals and numbering never
 * bypass `salesCalculationService`/`anterOfferNumberService`.
 */
export const { metadata: crudMetadata, GET } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] },
  },
  orm: {
    entity: AnterOffer,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterOfferListSchema,
    entityId: ENTITY_ID,
    fields: [
      'id', 'offer_number', 'project_id', 'revision_id', 'customer_entity_id', 'status',
      'is_incomplete', 'currency_code', 'grand_total_net_amount', 'grand_total_gross_amount',
      'valid_until', 'organization_id', 'tenant_id', 'updated_at',
    ],
    sortFieldMap: { id: 'id', created_at: 'created_at' },
    buildFilters: async (query: OfferListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.projectId) filters.project_id = query.projectId
      if (query.revisionId) filters.revision_id = query.revisionId
      if (query.customerEntityId) filters.customer_entity_id = query.customerEntityId
      if (query.status) filters.status = query.status
      return filters
    },
  },
})

export const metadata = {
  ...crudMetadata,
  POST: { requireAuth: true, requireFeatures: ['anter_configurator.value'] },
}

export async function POST(req: Request) {
  const parsed = buildBodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute('anter_configurator.offer.build', {
      input: { organizationId, tenantId, ...parsed.data },
      ctx,
    })
    return NextResponse.json({ item: result }, { status: 201 })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi = createAnterConfiguratorCrudOpenApi({
  resourceName: 'Offer',
  pluralName: 'Offers',
  querySchema: anterOfferListSchema,
  listResponseSchema: createAnterConfiguratorPagedListResponseSchema(offerListItemSchema),
  create: {
    schema: buildBodySchema,
    responseSchema: anterConfiguratorCreatedSchema,
    description: 'Builds a draft offer from a revision (anter_configurator.offer.build).',
  },
})
