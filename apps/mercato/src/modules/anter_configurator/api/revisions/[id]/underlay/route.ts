import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { AttachmentService } from '@open-mercato/core/modules/attachments/lib/attachment-service'
import { AnterProjectRevision } from '../../../../data/entities'
import { resolveAnterConfiguratorCommandContext } from '../../../../lib/staffCommandContext'
import { ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE } from '../../../../setup'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] } }

const UNDERLAY_ENTITY_ID = 'anter_configurator:anter_project_revision'

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/** Staff counterpart of the portal underlay read (internal-mode workspace, s9). */
export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)

  try {
    const em = (container.resolve('em') as EntityManager).fork()
    const revision = await em.findOne(AnterProjectRevision, { id: revisionId, organizationId, tenantId, deletedAt: null })
    if (!revision || !revision.underlayAttachmentId) throw new CrudHttpError(404, { error: '[internal] underlay not found' })

    let attachmentService: AttachmentService | null = null
    try {
      attachmentService = container.resolve<AttachmentService>('attachmentService')
    } catch {
      attachmentService = null
    }
    if (!attachmentService) throw new CrudHttpError(409, { error: 'underlay_unavailable' })

    const result = await attachmentService.readScoped({
      attachmentId: revision.underlayAttachmentId,
      auth: ctx.auth!,
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
