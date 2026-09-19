import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { invalidateCrudCache } from '@open-mercato/shared/lib/crud/cache'
import { AnterPartnerGroupDiscount, AnterPartnerTerms } from '../../data/entities'
import {
  anterPartnerGroupDiscountCreateSchema,
  anterPartnerGroupDiscountListSchema,
  anterPartnerGroupDiscountUpdateSchema,
} from '../../data/validators'
import {
  createAnterOrdersCrudOpenApi,
  createAnterOrdersPagedListResponseSchema,
  anterOrdersOkSchema,
} from '../openapi'
import { resolveCache, invalidateAnterPartnerTermsCache } from '../../lib/cache'

const ENTITY_ID = 'anter_orders:anter_partner_group_discount' as const

type GroupDiscountListQuery = z.infer<typeof anterPartnerGroupDiscountListSchema>

const groupDiscountListItemSchema = z.object({
  id: z.string().uuid(),
  partner_terms_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  discount_rate: z.string(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

async function invalidateTermsCacheForPartner(
  container: { resolve: (name: string) => unknown },
  em: { findOne: (...args: unknown[]) => Promise<unknown> },
  partnerTermsId: string,
  organizationId: string | null | undefined,
) {
  const terms = (await em.findOne(AnterPartnerTerms, { id: partnerTermsId })) as AnterPartnerTerms | null
  if (!terms) return
  const cache = resolveCache(container)
  await invalidateAnterPartnerTermsCache(cache, organizationId, terms.customerEntityId)
}

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_orders.view'] },
    POST: { requireAuth: true, requireFeatures: ['anter_orders.terms.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['anter_orders.terms.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['anter_orders.terms.manage'] },
  },
  orm: {
    entity: AnterPartnerGroupDiscount,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterPartnerGroupDiscountListSchema,
    entityId: ENTITY_ID,
    fields: ['id', 'partner_terms_id', 'category_id', 'discount_rate', 'organization_id', 'tenant_id', 'updated_at'],
    sortFieldMap: {
      id: 'id',
      partner_terms_id: 'partner_terms_id',
      created_at: 'created_at',
    },
    buildFilters: async (query: GroupDiscountListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.partnerTermsId) filters.partner_terms_id = query.partnerTermsId
      return filters
    },
  },
  create: {
    schema: anterPartnerGroupDiscountCreateSchema,
    mapToEntity: (input) => ({
      partnerTermsId: input.partnerTermsId,
      categoryId: input.categoryId ?? null,
      discountRate: String(input.discountRate),
    }),
    response: (entity) => ({ id: String(entity.id) }),
  },
  update: {
    schema: anterPartnerGroupDiscountUpdateSchema,
    getId: (input) => input.id,
    applyToEntity: (entity, input) => {
      if (input.partnerTermsId) entity.partnerTermsId = input.partnerTermsId
      if (input.categoryId !== undefined) entity.categoryId = input.categoryId ?? null
      if (input.discountRate != null) entity.discountRate = String(input.discountRate)
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
      await invalidateTermsCacheForPartner(ctx.container, ctx.container.resolve('em') as never, entity.partnerTermsId, ctx.selectedOrganizationId ?? ctx.auth.orgId)
      await invalidateCrudCache(
        ctx.container,
        ENTITY_ID,
        { id: entity.id, organizationId: ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null, tenantId: ctx.auth.tenantId ?? null },
        ctx.auth.tenantId ?? null,
        'anter_orders.partner-group-discount.create',
        [],
      )
    },
    afterUpdate: async (entity, ctx) => {
      if (!ctx.auth) return
      await invalidateTermsCacheForPartner(ctx.container, ctx.container.resolve('em') as never, entity.partnerTermsId, ctx.selectedOrganizationId ?? ctx.auth.orgId)
      await invalidateCrudCache(
        ctx.container,
        ENTITY_ID,
        { id: entity.id, organizationId: ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null, tenantId: ctx.auth.tenantId ?? null },
        ctx.auth.tenantId ?? null,
        'anter_orders.partner-group-discount.update',
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
        'anter_orders.partner-group-discount.delete',
        [],
      )
    },
  },
})

export const openApi = createAnterOrdersCrudOpenApi({
  resourceName: 'Partner Group Discount',
  pluralName: 'Partner Group Discounts',
  querySchema: anterPartnerGroupDiscountListSchema,
  listResponseSchema: createAnterOrdersPagedListResponseSchema(groupDiscountListItemSchema),
  create: {
    schema: anterPartnerGroupDiscountCreateSchema,
    description: 'Creates a category-scoped discount override for a partner.',
  },
  update: {
    schema: anterPartnerGroupDiscountUpdateSchema,
    responseSchema: anterOrdersOkSchema,
    description: 'Updates a partner group discount record.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: anterOrdersOkSchema,
    description: 'Soft-deletes a partner group discount record.',
  },
})
