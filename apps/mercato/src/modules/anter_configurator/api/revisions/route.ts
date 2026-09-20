import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { AnterProjectRevision } from '../../data/entities'

const ENTITY_ID = 'anter_configurator:anter_project_revision' as const

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  id: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
})
type RevisionListQuery = z.infer<typeof listSchema>

/**
 * Back-office revision read — the project detail's "revision history" table
 * (Implementation Plan Phase F step 9). Deliberately GET-only: revisions are
 * created and edited exclusively via project creation, `submission.create`
 * and `revision.branch` (later phases) — a generic CRUD write would bypass
 * their numbering/state-machine invariants (§3.8).
 */
export const { metadata, GET } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] },
  },
  orm: {
    entity: AnterProjectRevision,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: listSchema,
    entityId: ENTITY_ID,
    fields: [
      'id', 'project_id', 'revision_label', 'state', 'metres_per_unit', 'bom_computed_at',
      'bom_total_net_amount', 'bom_currency_code', 'has_unpriced_items', 'technical_acceptance_state',
      'underlay_attachment_id', 'underlay_width_units', 'underlay_height_units', 'grid_size_m',
      'organization_id', 'tenant_id', 'updated_at', 'created_at',
    ],
    sortFieldMap: {
      id: 'id',
      revision_label: 'revision_label',
      created_at: 'created_at',
    },
    buildFilters: async (query: RevisionListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.projectId) filters.project_id = query.projectId
      return filters
    },
  },
})
