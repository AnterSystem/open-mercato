import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { AttachmentService } from '@open-mercato/core/modules/attachments/lib/attachment-service'
import { AnterProject, AnterProjectRevision } from '../../../data/entities'
import { anterProjectCreateSchema } from '../../../data/validators'
import type { AnterProjectNumberService } from '../../../services/anterProjectNumberService'
import { resolveAnterConfiguratorPortalContext } from '../../../lib/portalContext'
import { anterConfiguratorTag, anterConfiguratorCreatedSchema } from '../../openapi'

export const metadata = {
  GET: { requireAuth: false },
  POST: { requireAuth: false },
}

const portalProjectCreateSchema = anterProjectCreateSchema.pick({ name: true })

/**
 * Portal project list (spec §API Contracts Portal table). Always scoped to
 * the caller's `customerEntityId` from the JWT — never a request parameter.
 */
export async function GET(req: Request) {
  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '50') || 50))
  const id = url.searchParams.get('id')

  const [items, total] = await context.em.findAndCount(AnterProject, {
    ...(id ? { id } : {}),
    customerEntityId: context.customerEntityId,
    organizationId: context.organizationId,
    tenantId: context.tenantId,
    deletedAt: null,
  }, {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    items: items.map((project) => ({
      id: project.id,
      projectNumber: project.projectNumber,
      name: project.name,
      origin: project.origin,
      status: project.status,
      currentRevisionId: project.currentRevisionId ?? null,
    })),
    total,
    page,
    pageSize,
  })
}

/**
 * Creates a project and its first revision, `A` (spec §API Contracts Portal
 * table, Implementation Plan Phase G step 18). §3.13: `attachments` is
 * "nearly hard" — without it there is no underlay, so creation is refused
 * with a clear message rather than a blank canvas.
 */
export async function POST(req: Request) {
  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

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
  const parsed = portalProjectCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input'), issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const guardResult = await runRouteMutationGuards({
      container: context.container,
      req,
      auth: { userId: context.customerUserId, tenantId: context.tenantId, organizationId: context.organizationId, userFeatures: [] },
      input: { resourceKind: 'anter_configurator.project', operation: 'create' },
    })
    if (!guardResult.ok) return guardResult.response

    let attachmentService: AttachmentService | null = null
    try {
      attachmentService = context.container.resolve<AttachmentService>('attachmentService')
    } catch {
      attachmentService = null
    }
    if (!attachmentService) {
      return NextResponse.json({ error: 'underlay_unavailable' }, { status: 409 })
    }

    const projectNumberService = context.container.resolve<AnterProjectNumberService>('anterProjectNumberService')
    const projectNumber = await projectNumberService.generate({ organizationId: context.organizationId, tenantId: context.tenantId })

    const project = context.em.create(AnterProject, {
      id: randomUUID(),
      projectNumber,
      name: parsed.data.name,
      customerEntityId: context.customerEntityId,
      customerUserId: context.customerUserId,
      origin: 'portal',
      status: 'active',
      organizationId: context.organizationId,
      tenantId: context.tenantId,
    })
    const revision = context.em.create(AnterProjectRevision, {
      id: randomUUID(),
      projectId: project.id,
      revisionLabel: 'A',
      state: 'draft',
      gridSizeM: '0.5',
      organizationId: context.organizationId,
      tenantId: context.tenantId,
    })
    project.currentRevisionId = revision.id
    context.em.persist([project, revision])
    await context.em.flush()

    await guardResult.runAfterSuccess()

    return NextResponse.json({ item: { id: project.id, projectNumber: project.projectNumber, currentRevisionId: revision.id } }, { status: 201 })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Portal configurator projects',
  methods: {
    GET: {
      summary: "The partner's projects with current revision",
      responses: [{ status: 200, description: 'List', schema: z.object({ items: z.array(z.unknown()), total: z.number() }) }],
    },
    POST: {
      summary: 'Creates project + revision A',
      requestBody: { contentType: 'application/json', schema: portalProjectCreateSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ item: anterConfiguratorCreatedSchema }) }],
      errors: [{ status: 409, description: 'attachments module absent', schema: z.object({ error: z.literal('underlay_unavailable') }) }],
    },
  },
}
