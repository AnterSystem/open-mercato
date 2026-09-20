import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { JobContext, QueuedJob, WorkerMeta } from '@open-mercato/queue'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { AnterProject, AnterProjectRevision } from '../data/entities'
import { emitAnterConfiguratorEvent } from '../events'
import { getAbandonmentThresholds } from '../lib/tenantSettings'

const logger = createLogger('anter_configurator').child({ component: 'workers.projectAbandonment' })

export const ANTER_CONFIGURATOR_ABANDONMENT_QUEUE = 'anter_configurator.project_abandonment'

const payloadSchema = z.object({
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid(),
})

export const metadata: WorkerMeta = {
  queue: ANTER_CONFIGURATOR_ABANDONMENT_QUEUE,
  id: 'anter_configurator:project-abandonment',
  concurrency: 1,
}

/**
 * A-5's abandonment tick (spec §3.12, step 47). Raises `project.abandoned`
 * for a project whose latest (current) revision is still `draft`, older
 * than the tenant's configured `abandonedAfterDays`, and whose computed BOM
 * value exceeds `abandonedMinValue` — both configurable, never hardcoded,
 * because the source prototype explicitly left the threshold unagreed.
 */
export default async function handle(job: QueuedJob<Record<string, unknown>>, _ctx: JobContext): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('[internal] project abandonment tick received an unscoped payload; skipping')
    return
  }
  const scope = parsed.data

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  const { abandonedAfterDays, abandonedMinValue } = await getAbandonmentThresholds(container, scope)

  const cutoff = new Date(Date.now() - abandonedAfterDays * 24 * 60 * 60 * 1000)
  const projects = await em.find(AnterProject, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    status: 'active',
    deletedAt: null,
  })

  for (const project of projects) {
    if (!project.currentRevisionId) continue
    const revision = await em.findOne(AnterProjectRevision, { id: project.currentRevisionId })
    if (!revision || revision.state !== 'draft') continue
    if (revision.updatedAt > cutoff) continue
    const value = revision.bomTotalNetAmount != null ? Number(revision.bomTotalNetAmount) : 0
    if (value < abandonedMinValue) continue

    // Marking the project `abandoned` here (not just emitting the event) is
    // what makes this idempotent under a daily tick — the query above only
    // ever looks at `status: 'active'` projects, so a flagged one is raised
    // exactly once, not every day it stays untouched.
    project.status = 'abandoned'
    await em.flush()

    await emitAnterConfiguratorEvent('anter_configurator.project.abandoned', {
      projectId: project.id,
      revisionId: revision.id,
      customerEntityId: project.customerEntityId ?? null,
      valueNetAmount: value,
      ageDays: Math.floor((Date.now() - revision.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
    }, { persistent: true, tenantId: scope.tenantId, organizationId: scope.organizationId })
  }
}
