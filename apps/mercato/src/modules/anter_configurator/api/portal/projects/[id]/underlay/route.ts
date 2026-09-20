import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { AttachmentService } from '@open-mercato/core/modules/attachments/lib/attachment-service'
import { AnterProject, AnterProjectRevision } from '../../../../../data/entities'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE } from '../../../../../setup'
import { anterConfiguratorTag } from '../../../../openapi'

export const metadata = { POST: { requireAuth: false } }

const MAX_UNDERLAY_BYTES = 25 * 1024 * 1024
const ALLOWED_UNDERLAY_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'application/pdf'])
const UNDERLAY_ENTITY_ID = 'anter_configurator:anter_project_revision'

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

function assertMultipartUpload(request: Request): void {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new CrudHttpError(400, { error: '[internal] expected multipart/form-data' })
  }
}

/**
 * Underlay upload (spec §3.15): the caller's own site plan, stored on a
 * dedicated non-public partition, never shared with `productsMedia`. There
 * is no server-side downscaling here (that needs an image-processing
 * dependency this module does not add without asking first) — the browser
 * reports the natural image dimensions once loaded and submits them with
 * calibration (`PUT .../calibration`'s optional `underlayWidthUnits`/
 * `underlayHeightUnits`).
 */
export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const projectId = params.id?.trim()
  if (!projectId) {
    return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })
  }

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    const project = await context.em.findOne(AnterProject, {
      id: projectId,
      customerEntityId: context.customerEntityId,
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      deletedAt: null,
    })
    if (!project || !project.currentRevisionId) throw new CrudHttpError(404, { error: '[internal] project not found' })
    const revision = await context.em.findOne(AnterProjectRevision, { id: project.currentRevisionId, deletedAt: null })
    if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })
    if (revision.state !== 'draft') {
      return NextResponse.json({ error: 'revision_locked', reason: 'calibrated_after_submission' }, { status: 409 })
    }

    const guardResult = await runRouteMutationGuards({
      container: context.container,
      req,
      auth: { userId: context.customerUserId, tenantId: context.tenantId, organizationId: context.organizationId, userFeatures: [] },
      input: { resourceKind: 'anter_configurator.revision', resourceId: revision.id, operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    let attachmentService: AttachmentService | null = null
    try {
      attachmentService = context.container.resolve<AttachmentService>('attachmentService')
    } catch {
      attachmentService = null
    }
    if (!attachmentService || typeof attachmentService.readUploadForm !== 'function') {
      return NextResponse.json({ error: 'underlay_unavailable' }, { status: 409 })
    }

    assertMultipartUpload(req)
    const form = await attachmentService.readUploadForm(req)
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '[internal] file is required' }, { status: 400 })
    }
    if (!ALLOWED_UNDERLAY_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'underlay_invalid_type', mimeType: file.type }, { status: 415 })
    }
    if (file.size > MAX_UNDERLAY_BYTES) {
      return NextResponse.json({ error: 'underlay_too_large', maxBytes: MAX_UNDERLAY_BYTES }, { status: 413 })
    }
    attachmentService.validateUpload({ fileName: file.name, fileSize: file.size })

    const buffer = Buffer.from(await file.arrayBuffer())
    const created = await attachmentService.createScoped({
      entityId: UNDERLAY_ENTITY_ID,
      recordId: revision.id,
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      partitionCode: ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE,
      fileName: file.name,
      declaredMimeType: file.type,
      buffer,
      assignments: [{ type: UNDERLAY_ENTITY_ID, id: revision.id }],
    })

    revision.underlayAttachmentId = created.id
    await context.em.flush()

    await guardResult.runAfterSuccess()

    return NextResponse.json({ item: { attachmentId: created.id, fileName: created.fileName, mimeType: created.mimeType, fileSize: created.fileSize } })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Upload a project revision underlay',
  methods: {
    POST: {
      summary: 'Multipart underlay upload (png/jpeg/pdf, max 25MB) via attachmentService.readUploadForm()',
      responses: [{ status: 200, description: 'Uploaded', schema: z.object({ item: z.object({ attachmentId: z.string().uuid(), fileName: z.string(), mimeType: z.string(), fileSize: z.number() }) }) }],
      errors: [
        { status: 404, description: 'Project not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'attachments absent, or revision locked', schema: z.object({ error: z.string() }) },
        { status: 413, description: 'File too large', schema: z.object({ error: z.string() }) },
        { status: 415, description: 'Unsupported file type', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
