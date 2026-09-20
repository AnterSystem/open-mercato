import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  AnterProject,
  AnterProjectRevision,
  AnterSubmission,
  AnterSubmissionComment,
  AnterSubmissionEvent,
} from '../data/entities'

export type SubmissionScope = { organizationId: string; tenantId: string }

export type SubmissionSummary = {
  id: string
  submissionNumber: string
  projectId: string
  projectName: string
  revisionId: string
  revisionLabel: string
  customerEntityId: string | null
  track: string
  state: string
  assignedUserId: string | null
  dueAt: string | null
  submittedAt: string
  closedAt: string | null
  positionCount: number
  isOverdue: boolean
}

export type SubmissionCommentView = {
  id: string
  elementId: string | null
  authorUserId: string | null
  authorCustomerUserId: string | null
  body: string
  visibility: string
  createdAt: string
}

export type SubmissionEventView = {
  id: string
  fromState: string | null
  toState: string
  actorUserId: string | null
  actorCustomerUserId: string | null
  reason: string | null
  occurredAt: string
}

function toSummary(submission: AnterSubmission, projectName: string, revisionLabel: string): SubmissionSummary {
  const now = Date.now()
  return {
    id: submission.id,
    submissionNumber: submission.submissionNumber,
    projectId: submission.projectId,
    projectName,
    revisionId: submission.revisionId,
    revisionLabel,
    customerEntityId: submission.customerEntityId ?? null,
    track: submission.track,
    state: submission.state,
    assignedUserId: submission.assignedUserId ?? null,
    dueAt: submission.dueAt ? submission.dueAt.toISOString() : null,
    submittedAt: submission.submittedAt.toISOString(),
    closedAt: submission.closedAt ? submission.closedAt.toISOString() : null,
    positionCount: submission.positionCount,
    isOverdue: submission.state === 'technical_review' && !!submission.dueAt && submission.dueAt.getTime() < now,
  }
}

/**
 * Shared read path behind the queue (s46) and the submission detail page —
 * one query shape for both so the KPI tiles' counts and the row-by-row list
 * never disagree (§3.7 rule 1).
 */
export async function listSubmissionsForStaff(
  em: EntityManager,
  scope: SubmissionScope,
  filter: { state?: string; track?: string; page: number; pageSize: number },
): Promise<{ items: SubmissionSummary[]; total: number; kpi: Record<string, number> }> {
  const where: Record<string, unknown> = { organizationId: scope.organizationId, tenantId: scope.tenantId }
  if (filter.track) where.track = filter.track
  const listWhere = filter.state ? { ...where, state: filter.state } : where

  const [submissions, total, allForKpi] = await Promise.all([
    em.find(AnterSubmission, listWhere, {
      orderBy: { submittedAt: 'desc' },
      limit: filter.pageSize,
      offset: (filter.page - 1) * filter.pageSize,
    }),
    em.count(AnterSubmission, listWhere),
    em.find(AnterSubmission, where),
  ])

  const kpi: Record<string, number> = {}
  for (const row of allForKpi) kpi[row.state] = (kpi[row.state] ?? 0) + 1

  const projectIds = Array.from(new Set(submissions.map((submission) => submission.projectId)))
  const revisionIds = Array.from(new Set(submissions.map((submission) => submission.revisionId)))
  const [projects, revisions] = await Promise.all([
    projectIds.length ? em.find(AnterProject, { id: { $in: projectIds } }) : Promise.resolve([]),
    revisionIds.length ? em.find(AnterProjectRevision, { id: { $in: revisionIds } }) : Promise.resolve([]),
  ])
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
  const revisionLabelById = new Map(revisions.map((revision) => [revision.id, revision.revisionLabel]))

  return {
    items: submissions.map((submission) => toSummary(
      submission,
      projectNameById.get(submission.projectId) ?? '',
      revisionLabelById.get(submission.revisionId) ?? '',
    )),
    total,
    kpi,
  }
}

export async function loadSubmissionForStaff(em: EntityManager, scope: SubmissionScope, submissionId: string): Promise<AnterSubmission> {
  const submission = await em.findOne(AnterSubmission, { id: submissionId, organizationId: scope.organizationId, tenantId: scope.tenantId })
  if (!submission) throw new CrudHttpError(404, { error: '[internal] submission not found' })
  return submission
}

export async function listSubmissionComments(em: EntityManager, submissionId: string, options: { includeInternal: boolean }): Promise<SubmissionCommentView[]> {
  const where: Record<string, unknown> = { submissionId }
  if (!options.includeInternal) where.visibility = 'shared'
  const comments = await em.find(AnterSubmissionComment, where, { orderBy: { createdAt: 'asc' } })
  return comments.map((comment) => ({
    id: comment.id,
    elementId: comment.elementId ?? null,
    authorUserId: comment.authorUserId ?? null,
    authorCustomerUserId: comment.authorCustomerUserId ?? null,
    body: comment.body,
    visibility: comment.visibility,
    createdAt: comment.createdAt.toISOString(),
  }))
}

export async function listSubmissionEvents(em: EntityManager, submissionId: string): Promise<SubmissionEventView[]> {
  const events = await em.find(AnterSubmissionEvent, { submissionId }, { orderBy: { occurredAt: 'asc' } })
  return events.map((event) => ({
    id: event.id,
    fromState: event.fromState ?? null,
    toState: event.toState,
    actorUserId: event.actorUserId ?? null,
    actorCustomerUserId: event.actorCustomerUserId ?? null,
    reason: event.reason ?? null,
    occurredAt: event.occurredAt.toISOString(),
  }))
}
