import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { AnterProject, AnterProjectRevision, AnterSubmission } from '../../../data/entities'
import { resolveAnterConfiguratorPortalContext } from '../../../lib/portalContext'
import { anterConfiguratorTag } from '../../openapi'

export const metadata = { GET: { requireAuth: false } }

export async function GET(req: Request) {
  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const submissions = await context.em.find(AnterSubmission, {
    customerEntityId: context.customerEntityId,
    organizationId: context.organizationId,
    tenantId: context.tenantId,
  }, { orderBy: { submittedAt: 'desc' }, limit: 50 })

  const projectIds = Array.from(new Set(submissions.map((submission) => submission.projectId)))
  const revisionIds = Array.from(new Set(submissions.map((submission) => submission.revisionId)))
  const [projects, revisions] = await Promise.all([
    projectIds.length ? context.em.find(AnterProject, { id: { $in: projectIds } }) : Promise.resolve([]),
    revisionIds.length ? context.em.find(AnterProjectRevision, { id: { $in: revisionIds } }) : Promise.resolve([]),
  ])
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
  const revisionLabelById = new Map(revisions.map((revision) => [revision.id, revision.revisionLabel]))

  return NextResponse.json({
    items: submissions.map((submission) => ({
      id: submission.id,
      submissionNumber: submission.submissionNumber,
      projectId: submission.projectId,
      projectName: projectNameById.get(submission.projectId) ?? '',
      revisionId: submission.revisionId,
      revisionLabel: revisionLabelById.get(submission.revisionId) ?? '',
      track: submission.track,
      state: submission.state,
      submittedAt: submission.submittedAt.toISOString(),
      closedAt: submission.closedAt ? submission.closedAt.toISOString() : null,
    })),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Portal: list my configurator submissions',
  methods: {
    GET: {
      summary: 'Always scoped to the caller\'s customerEntityId from the JWT (§3.14)',
      responses: [{ status: 200, description: 'Submissions', schema: z.object({ items: z.array(z.unknown()) }) }],
    },
  },
}
