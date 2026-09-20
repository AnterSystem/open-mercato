import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterPlanPoint, AnterProject, AnterProjectElement, AnterProjectRevision } from '../../../data/entities'
import { resolveAnterConfiguratorCommandContext } from '../../../lib/staffCommandContext'
import { listSubmissionComments, listSubmissionEvents, loadSubmissionForStaff } from '../../../lib/submissionAccess'
import { anterConfiguratorTag } from '../../openapi'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/**
 * Submission detail (spec s47, Implementation Plan step 35): the read-only
 * drawing (elements/points as drawn at submission time), the full comment
 * thread INCLUDING internal notes (staff-only surface — the portal's own
 * detail route filters these out), and the state-transition history.
 */
export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const submissionId = params.id?.trim()
  if (!submissionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  try {
    const { container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const em = (container.resolve('em') as EntityManager).fork()

    const submission = await loadSubmissionForStaff(em, { organizationId, tenantId }, submissionId)
    const [project, revision, comments, events] = await Promise.all([
      em.findOne(AnterProject, { id: submission.projectId }),
      em.findOne(AnterProjectRevision, { id: submission.revisionId }),
      listSubmissionComments(em, submission.id, { includeInternal: true }),
      listSubmissionEvents(em, submission.id),
    ])
    const [elements, points] = await Promise.all([
      em.find(AnterProjectElement, { revisionId: submission.revisionId }, { orderBy: { sortOrder: 'asc' } }),
      em.find(AnterPlanPoint, { revisionId: submission.revisionId }),
    ])

    return NextResponse.json({
      item: {
        id: submission.id,
        submissionNumber: submission.submissionNumber,
        projectId: submission.projectId,
        projectName: project?.name ?? '',
        revisionId: submission.revisionId,
        revisionLabel: revision?.revisionLabel ?? '',
        customerEntityId: submission.customerEntityId ?? null,
        track: submission.track,
        state: submission.state,
        dueAt: submission.dueAt ? submission.dueAt.toISOString() : null,
        submittedAt: submission.submittedAt.toISOString(),
        closedAt: submission.closedAt ? submission.closedAt.toISOString() : null,
        resultingOrderId: submission.resultingOrderId ?? null,
        drawing: {
          underlayAttachmentId: revision?.underlayAttachmentId ?? null,
          underlayWidthUnits: revision?.underlayWidthUnits != null ? Number(revision.underlayWidthUnits) : null,
          underlayHeightUnits: revision?.underlayHeightUnits != null ? Number(revision.underlayHeightUnits) : null,
          metresPerUnit: revision?.metresPerUnit != null ? Number(revision.metresPerUnit) : null,
          elements: elements.map((element) => ({
            id: element.id,
            elementKind: element.elementKind,
            productId: element.productId ?? null,
            geometry: element.geometry,
            hostElementId: element.hostElementId ?? null,
            label: element.label ?? null,
            isOutsidePriceList: element.isOutsidePriceList,
          })),
          points: points.map((point) => ({ id: point.id, pointKind: point.pointKind, position: point.position, state: point.state })),
        },
        comments,
        events,
      },
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Read an Anter configurator submission (queue detail)',
  methods: {
    GET: {
      summary: 'Read-only drawing snapshot, full comment thread (incl. internal), and the state-transition history.',
      responses: [{ status: 200, description: 'Submission', schema: z.object({ item: z.unknown() }) }],
      errors: [{ status: 404, description: 'Submission not found', schema: z.object({ error: z.string() }) }],
    },
  },
}
