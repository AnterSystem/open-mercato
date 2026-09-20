import { NextResponse } from 'next/server'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { loadOwnedRevision } from '../../../../lib/portalOwnership'
import { resolveAnterConfiguratorPortalContext } from '../../../../lib/portalContext'

export const metadata = { GET: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/** Revision detail — calibration/state, for opening the workspace (§UI/UX). */
export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    const { revision } = await loadOwnedRevision(context.em, revisionId, context)
    return NextResponse.json({
      item: {
        id: revision.id,
        revisionLabel: revision.revisionLabel,
        state: revision.state,
        underlayAttachmentId: revision.underlayAttachmentId ?? null,
        underlayWidthUnits: revision.underlayWidthUnits != null ? Number(revision.underlayWidthUnits) : null,
        underlayHeightUnits: revision.underlayHeightUnits != null ? Number(revision.underlayHeightUnits) : null,
        metresPerUnit: revision.metresPerUnit != null ? Number(revision.metresPerUnit) : null,
        gridSizeM: Number(revision.gridSizeM),
        hasUnpricedItems: revision.hasUnpricedItems,
        updatedAt: revision.updatedAt.toISOString(),
      },
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}
