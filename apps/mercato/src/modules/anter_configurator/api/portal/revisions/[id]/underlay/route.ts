import { NextResponse } from 'next/server'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { AttachmentService } from '@open-mercato/core/modules/attachments/lib/attachment-service'
import { AnterProject, AnterProjectRevision } from '../../../../../data/entities'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { requirePortalConfiguratorMode } from '../../../../../lib/mode'
import { ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE } from '../../../../../setup'

export const metadata = { GET: { requireAuth: false } }

const UNDERLAY_ENTITY_ID = 'anter_configurator:anter_project_revision'

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/**
 * Streams the underlay bytes back for the `<image>` element `PlanCanvas`
 * loads (spec §3.15 — a customer's site plan, confidential, never a public
 * URL). Ownership is verified against the caller's own `customerEntityId`
 * before `attachmentService.readScoped` runs its own partition/scope check.
 */
export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const modeOrResponse = await requirePortalConfiguratorMode(context)
  if (modeOrResponse instanceof Response) return modeOrResponse

  try {
    const revision = await context.em.findOne(AnterProjectRevision, {
      id: revisionId,
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      deletedAt: null,
    })
    if (!revision || !revision.underlayAttachmentId) throw new CrudHttpError(404, { error: '[internal] underlay not found' })

    const project = await context.em.findOne(AnterProject, {
      id: revision.projectId,
      customerEntityId: context.customerEntityId,
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      deletedAt: null,
    })
    if (!project) throw new CrudHttpError(404, { error: '[internal] project not found' })

    let attachmentService: AttachmentService | null = null
    try {
      attachmentService = context.container.resolve<AttachmentService>('attachmentService')
    } catch {
      attachmentService = null
    }
    if (!attachmentService) throw new CrudHttpError(409, { error: 'underlay_unavailable' })

    const result = await attachmentService.readScoped({
      attachmentId: revision.underlayAttachmentId,
      auth: { sub: context.customerUserId, tenantId: context.tenantId, orgId: context.organizationId },
      expectedOwner: { entityId: UNDERLAY_ENTITY_ID, recordId: revision.id },
      expectedPartitionCode: ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE,
      requirePrivatePartition: true,
    })

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': result.contentDisposition,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}
