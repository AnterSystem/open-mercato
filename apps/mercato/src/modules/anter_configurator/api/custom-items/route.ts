import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { AnterCustomItem, AnterProjectRevision } from '../../data/entities'
import {
  anterCustomItemCreateSchema,
  anterCustomItemListSchema,
  anterCustomItemUpdateSchema,
} from '../../data/validators'
import {
  createAnterConfiguratorCrudOpenApi,
  createAnterConfiguratorPagedListResponseSchema,
  anterConfiguratorOkSchema,
} from '../openapi'

const ENTITY_ID = 'anter_configurator:anter_custom_item' as const

type CustomItemListQuery = z.infer<typeof anterCustomItemListSchema>

const customItemListItemSchema = z.object({
  id: z.string().uuid(),
  revision_id: z.string().uuid(),
  description: z.string(),
  quantity: z.string(),
  unit_code: z.string(),
  assigned_constructor_user_id: z.string().uuid().nullable().optional(),
  valuation_state: z.string(),
  unit_price_net: z.string().nullable().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

/**
 * Admin CRUD for CC-5 non-standard positions (spec §3.6, Implementation Plan
 * Phase F step 8). Pricing a position (`valuationState` → `priced`, clearing
 * the revision's incompleteness flag) is `anter_configurator.custom_item.price`
 * (Phase J) — this route only creates/edits/removes the position itself.
 */
export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] },
    POST: { requireAuth: true, requireFeatures: ['anter_configurator.internal'] },
    PUT: { requireAuth: true, requireFeatures: ['anter_configurator.value'] },
    DELETE: { requireAuth: true, requireFeatures: ['anter_configurator.internal'] },
  },
  orm: {
    entity: AnterCustomItem,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterCustomItemListSchema,
    entityId: ENTITY_ID,
    fields: [
      'id', 'revision_id', 'description', 'quantity', 'unit_code', 'assigned_constructor_user_id',
      'valuation_state', 'unit_price_net', 'organization_id', 'tenant_id', 'updated_at',
    ],
    sortFieldMap: {
      id: 'id',
      created_at: 'created_at',
    },
    buildFilters: async (query: CustomItemListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.revisionId) filters.revision_id = query.revisionId
      if (query.valuationState) filters.valuation_state = query.valuationState
      return filters
    },
  },
  create: {
    schema: anterCustomItemCreateSchema,
    mapToEntity: (input) => ({
      revisionId: input.revisionId,
      description: input.description,
      quantity: String(input.quantity),
      unitCode: input.unitCode,
      assignedConstructorUserId: input.assignedConstructorUserId ?? null,
    }),
    response: (entity) => ({ id: String(entity.id) }),
  },
  update: {
    schema: anterCustomItemUpdateSchema,
    getId: (input) => input.id,
    applyToEntity: (entity, input) => {
      if (input.description != null) entity.description = input.description
      if (input.quantity != null) entity.quantity = String(input.quantity)
      if (input.unitCode != null) entity.unitCode = input.unitCode
      if (input.assignedConstructorUserId !== undefined) entity.assignedConstructorUserId = input.assignedConstructorUserId ?? null
    },
    response: () => ({ ok: true }),
  },
  del: {
    idFrom: 'body',
    softDelete: true,
    response: () => ({ ok: true }),
  },
  hooks: {
    // §3.6: a revision with any `awaiting` custom item is unpriced-incomplete
    // — kept in sync here so a freshly-added custom item shows up without
    // waiting for the next `revision.compute_bom` recompute.
    afterCreate: async (entity, ctx) => {
      const em = (ctx.container.resolve('em') as EntityManager).fork()
      const revision = await em.findOne(AnterProjectRevision, { id: entity.revisionId })
      if (revision && !revision.hasUnpricedItems) {
        revision.hasUnpricedItems = true
        await em.flush()
      }
    },
  },
})

export const openApi = createAnterConfiguratorCrudOpenApi({
  resourceName: 'Custom Item',
  pluralName: 'Custom Items',
  querySchema: anterCustomItemListSchema,
  listResponseSchema: createAnterConfiguratorPagedListResponseSchema(customItemListItemSchema),
  create: {
    schema: anterCustomItemCreateSchema,
    description: 'Creates a CC-5 non-standard position on a revision (no catalogue product).',
  },
  update: {
    schema: anterCustomItemUpdateSchema,
    responseSchema: anterConfiguratorOkSchema,
    description: 'Updates a custom item position.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: anterConfiguratorOkSchema,
    description: 'Soft-deletes a custom item position.',
  },
})
