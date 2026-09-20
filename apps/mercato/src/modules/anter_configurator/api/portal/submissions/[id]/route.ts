import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterProject, AnterProjectRevision } from '../../../../data/entities'
import { resolveAnterConfiguratorPortalContext } from '../../../../lib/portalContext'
import { loadOwnedSubmission } from '../../../../lib/portalOwnership'
import { listSubmissionComments, listSubmissionEvents } from '../../../../lib/submissionAccess'
import { anterConfiguratorTag } from '../../../openapi'

export const metadata = { GET: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/**
 * Portal submission detail (spec §API Contracts Portal table, step 38).
 * `internal` comments are filtered out at the query — the visibility split
 * is enforced here, not by the client hiding a field (§3.7 rule 2's own
 * lesson applied to comments).
 */
export async function GET(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const submissionId = params.id?.trim()
  if (!submissionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    const submission = await loadOwnedSubmission(context.em, submissionId, context)
    const [project, revision, comments, events] = await Promise.all([
      context.em.findOne(AnterProject, { id: submission.projectId }),
      context.em.findOne(AnterProjectRevision, { id: submission.revisionId }),
      listSubmissionComments(context.em, submission.id, { includeInternal: false }),
      listSubmissionEvents(context.em, submission.id),
    ])

    return NextResponse.json({
      item: {
        id: submission.id,
        submissionNumber: submission.submissionNumber,
        projectId: submission.projectId,
        projectName: project?.name ?? '',
        revisionId: submission.revisionId,
        revisionLabel: revision?.revisionLabel ?? '',
        track: submission.track,
        state: submission.state,
        submittedAt: submission.submittedAt.toISOString(),
        closedAt: submission.closedAt ? submission.closedAt.toISOString() : null,
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
  summary: 'Portal: read one of my configurator submissions',
  methods: {
    GET: {
      summary: 'Shared comments only — internal notes never reach this response',
      responses: [{ status: 200, description: 'Submission', schema: z.object({ item: z.unknown() }) }],
      errors: [{ status: 404, description: 'Submission not found', schema: z.object({ error: z.string() }) }],
    },
  },
}
