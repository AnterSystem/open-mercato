import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterProject, AnterProjectRevision, AnterSubmission } from '../data/entities'

export type PortalRevisionScope = { organizationId: string; tenantId: string; customerEntityId: string }

/**
 * Loads a revision the caller owns — never by the revision id alone.
 * Another partner's project id returns a plain 404, per spec §3.14
 * ("another partner's project id returns `404`, not `403`").
 */
export async function loadOwnedRevision(
  em: EntityManager,
  revisionId: string,
  scope: PortalRevisionScope,
): Promise<{ revision: AnterProjectRevision; project: AnterProject }> {
  const revision = await em.findOne(AnterProjectRevision, {
    id: revisionId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    deletedAt: null,
  })
  if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })

  const project = await em.findOne(AnterProject, {
    id: revision.projectId,
    customerEntityId: scope.customerEntityId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    deletedAt: null,
  })
  if (!project) throw new CrudHttpError(404, { error: '[internal] revision not found' })

  return { revision, project }
}

/**
 * Same 404-not-403 rule for submissions (§3.14) — a submission belonging to
 * another partner is invisible, not merely forbidden.
 */
export async function loadOwnedSubmission(
  em: EntityManager,
  submissionId: string,
  scope: PortalRevisionScope,
): Promise<AnterSubmission> {
  const submission = await em.findOne(AnterSubmission, {
    id: submissionId,
    customerEntityId: scope.customerEntityId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
  })
  if (!submission) throw new CrudHttpError(404, { error: '[internal] submission not found' })
  return submission
}
