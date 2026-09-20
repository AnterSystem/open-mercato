import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { AttachmentService } from '@open-mercato/core/modules/attachments/lib/attachment-service'
import { AnterProject, AnterProjectRevision } from '../../data/entities'
import { anterProjectCreateSchema, anterProjectListSchema } from '../../data/validators'
import type { AnterProjectNumberService } from '../../services/anterProjectNumberService'
import { resolveAnterConfiguratorCommandContext } from '../../lib/staffCommandContext'
import { anterConfiguratorTag, anterConfiguratorCreatedSchema, createAnterConfiguratorPagedListResponseSchema } from '../openapi'

const ENTITY_ID = 'anter_configurator:anter_project' as const

type ProjectListQuery = z.infer<typeof anterProjectListSchema>

const { metadata: crudMetadata, GET } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] },
  },
  orm: {
    entity: AnterProject,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: anterProjectListSchema,
    entityId: ENTITY_ID,
    fields: [
      'id', 'project_number', 'name', 'customer_entity_id', 'customer_deal_id', 'origin',
      'current_revision_id', 'status', 'organization_id', 'tenant_id', 'updated_at', 'created_at',
    ],
    sortFieldMap: {
      id: 'id',
      project_number: 'project_number',
      created_at: 'created_at',
    },
    buildFilters: async (query: ProjectListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.customerEntityId) filters.customer_entity_id = query.customerEntityId
      if (query.status) filters.status = query.status
      return filters
    },
  },
})

export const metadata = {
  ...crudMetadata,
  POST: { requireAuth: true, requireFeatures: ['anter_configurator.internal'] },
}
export { GET }

/**
 * Staff-side project creation (spec Implementation Plan Phase F step 9 —
 * "admin-only inspection, no canvas"; portal creation with underlay upload is
 * Phase G's `POST /portal/projects`). Creates the project and its first
 * revision, `A`, in `draft`.
 *
 * §3.13: `attachments` is "nearly hard" — without it there is no underlay, so
 * the configurator refuses to create a project with a clear message rather
 * than offering a blank canvas. Existing projects stay readable.
 */
export async function POST(req: Request) {
  const { translate } = await resolveTranslations()
  let body: unknown = {}
  const rawText = await req.text()
  if (rawText.trim().length) {
    try {
      body = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
  }
  const parsed = anterProjectCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input'), issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)

    const guardResult = await runRouteMutationGuards({
      container,
      req,
      auth: { userId: ctx.auth!.sub, tenantId, organizationId },
      input: { resourceKind: 'anter_configurator.project', operation: 'create' },
    })
    if (!guardResult.ok) return guardResult.response

    let attachmentService: AttachmentService | null = null
    try {
      attachmentService = container.resolve<AttachmentService>('attachmentService')
    } catch {
      attachmentService = null
    }
    if (!attachmentService) {
      return NextResponse.json({ error: 'underlay_unavailable' }, { status: 409 })
    }

    const em = container.resolve('em') as import('@mikro-orm/postgresql').EntityManager
    const projectNumberService = container.resolve<AnterProjectNumberService>('anterProjectNumberService')
    const projectNumber = await projectNumberService.generate({ organizationId, tenantId })

    const project = em.create(AnterProject, {
      id: randomUUID(),
      projectNumber,
      name: parsed.data.name,
      customerEntityId: parsed.data.customerEntityId ?? null,
      customerUserId: parsed.data.customerUserId ?? null,
      customerDealId: parsed.data.customerDealId ?? null,
      origin: parsed.data.origin,
      siteAddressSnapshot: parsed.data.siteAddressSnapshot ?? null,
      status: 'active',
      organizationId,
      tenantId,
    })
    const revision = em.create(AnterProjectRevision, {
      id: randomUUID(),
      projectId: project.id,
      revisionLabel: 'A',
      state: 'draft',
      gridSizeM: '0.5',
      organizationId,
      tenantId,
    })
    project.currentRevisionId = revision.id
    em.persist([project, revision])
    await em.flush()

    await guardResult.runAfterSuccess()

    return NextResponse.json({ item: { id: project.id, projectNumber: project.projectNumber, currentRevisionId: revision.id } }, { status: 201 })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

const projectListItemSchema = z.object({
  id: z.string().uuid(),
  project_number: z.string(),
  name: z.string(),
  customer_entity_id: z.string().uuid().nullable().optional(),
  customer_deal_id: z.string().uuid().nullable().optional(),
  origin: z.string(),
  current_revision_id: z.string().uuid().nullable().optional(),
  status: z.string(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Anter configurator projects',
  methods: {
    GET: {
      summary: 'List projects (back office)',
      query: anterProjectListSchema,
      responses: [{ status: 200, description: 'Paged list', schema: createAnterConfiguratorPagedListResponseSchema(projectListItemSchema) }],
    },
    POST: {
      summary: 'Create a project and its first revision (internal mode)',
      requestBody: { contentType: 'application/json', schema: anterProjectCreateSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ item: anterConfiguratorCreatedSchema }) }],
      errors: [{ status: 409, description: 'attachments module absent', schema: z.object({ error: z.literal('underlay_unavailable') }) }],
    },
  },
}
