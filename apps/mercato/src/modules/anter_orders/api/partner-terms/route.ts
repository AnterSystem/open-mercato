import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { invalidateCrudCache } from '@open-mercato/shared/lib/crud/cache'
import { AnterPartnerTerms } from '../../data/entities'
import {
  anterPartnerTermsCreateSchema,
  anterPartnerTermsListSchema,
  anterPartnerTermsUpdateSchema,
} from '../../data/validators'
import {
  createAnterOrdersCrudOpenApi,
  createAnterOrdersPagedListResponseSchema,
  anterOrdersOkSchema,
} from '../openapi'
import { resolveCache, invalidateAnterPartnerTermsCache } from '../../lib/cache'

const ENTITY_ID = 'anter_orders:anter_partner_terms' as const

type PartnerTermsListQuery = z.infer<typeof anterPartnerTermsListSchema>

const partnerTermsListItemSchema = z.object({
  id: z.string().uuid(),
  customer_entity_id: z.string().uuid(),
  default_discount_rate: z.string(),
  price_list_code: z.string().nullable().optional(),
  is_blocked: z.boolean(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

async function invalidateTermsCache(container: { resolve: (name: string) => unknown }, organizationId: string | null | undefined, customerEntityId: string | null | undefined) {
  const cache = resolveCache(container)
  await invalidateAnterPartnerTermsCache(cache, organizationId, customerEntityId)
}

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] },
    POST: { requireAuth: true, requireFeatures: ['anter_orders.terms.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['anter_orders.terms.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['anter_orders.terms.manage'] },
  },
  orm: {
    entity: AnterPartnerTerms,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterPartnerTermsListSchema,
    entityId: ENTITY_ID,
    fields: ['id', 'customer_entity_id', 'default_discount_rate', 'price_list_code', 'is_blocked', 'organization_id', 'tenant_id', 'updated_at'],
    sortFieldMap: {
      id: 'id',
      customer_entity_id: 'customer_entity_id',
      created_at: 'created_at',
    },
    buildFilters: async (query: PartnerTermsListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.customerEntityId) filters.customer_entity_id = query.customerEntityId
      return filters
    },
  },
  create: {
    schema: anterPartnerTermsCreateSchema,
    mapToEntity: (input) => ({
      customerEntityId: input.customerEntityId,
      defaultDiscountRate: String(input.defaultDiscountRate ?? 0),
      priceListCode: input.priceListCode ?? null,
      isBlocked: input.isBlocked ?? false,
      notes: input.notes ?? null,
    }),
    response: (entity) => ({ id: String(entity.id) }),
  },
  update: {
    schema: anterPartnerTermsUpdateSchema,
    getId: (input) => input.id,
    applyToEntity: (entity, input) => {
      if (input.customerEntityId) entity.customerEntityId = input.customerEntityId
      if (input.defaultDiscountRate != null) entity.defaultDiscountRate = String(input.defaultDiscountRate)
      if (input.priceListCode !== undefined) entity.priceListCode = input.priceListCode ?? null
      if (input.isBlocked !== undefined) entity.isBlocked = input.isBlocked
      if (input.notes !== undefined) entity.notes = input.notes ?? null
    },
    response: () => ({ ok: true }),
  },
  del: {
    idFrom: 'body',
    softDelete: true,
    response: () => ({ ok: true }),
  },
  hooks: {
    afterCreate: async (entity, ctx) => {
      if (!ctx.auth) return
      await invalidateTermsCache(ctx.container, ctx.selectedOrganizationId ?? ctx.auth.orgId, entity.customerEntityId)
      await invalidateCrudCache(
        ctx.container,
        ENTITY_ID,
        { id: entity.id, organizationId: ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null, tenantId: ctx.auth.tenantId ?? null },
        ctx.auth.tenantId ?? null,
        'anter_orders.partner-terms.create',
        [],
      )
    },
    afterUpdate: async (entity, ctx) => {
      if (!ctx.auth) return
      await invalidateTermsCache(ctx.container, ctx.selectedOrganizationId ?? ctx.auth.orgId, entity.customerEntityId)
      await invalidateCrudCache(
        ctx.container,
        ENTITY_ID,
        { id: entity.id, organizationId: ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null, tenantId: ctx.auth.tenantId ?? null },
        ctx.auth.tenantId ?? null,
        'anter_orders.partner-terms.update',
        [],
      )
    },
    afterDelete: async (_id, ctx) => {
      if (!ctx.auth) return
      await invalidateCrudCache(
        ctx.container,
        ENTITY_ID,
        { organizationId: ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null, tenantId: ctx.auth.tenantId ?? null },
        ctx.auth.tenantId ?? null,
        'anter_orders.partner-terms.delete',
        [],
      )
    },
  },
})

export const openApi = createAnterOrdersCrudOpenApi({
  resourceName: 'Partner Terms',
  pluralName: 'Partner Terms',
  querySchema: anterPartnerTermsListSchema,
  listResponseSchema: createAnterOrdersPagedListResponseSchema(partnerTermsListItemSchema),
  create: {
    schema: anterPartnerTermsCreateSchema,
    description: 'Creates ordering terms (discount rate, price list, blocked flag) for a partner customer entity.',
  },
  update: {
    schema: anterPartnerTermsUpdateSchema,
    responseSchema: anterOrdersOkSchema,
    description: 'Updates a partner terms record.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: anterOrdersOkSchema,
    description: 'Soft-deletes a partner terms record.',
  },
})
