import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { JobContext, QueuedJob, WorkerMeta } from '@open-mercato/queue'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { AnterOffer } from '../data/entities'
import { emitAnterConfiguratorEvent } from '../events'

const logger = createLogger('anter_configurator').child({ component: 'workers.offerExpiry' })

export const ANTER_CONFIGURATOR_OFFER_EXPIRY_QUEUE = 'anter_configurator.offer_expiry'

const payloadSchema = z.object({
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid(),
})

export const metadata: WorkerMeta = {
  queue: ANTER_CONFIGURATOR_OFFER_EXPIRY_QUEUE,
  id: 'anter_configurator:offer-expiry',
  concurrency: 1,
}

/**
 * Offer expiry tick (spec §3.10, step 48): an `issued` offer past
 * `valid_until` moves to `expired` and can no longer produce an order — it
 * can only be reissued, which supersedes it (a separate, staff-initiated
 * action, not this worker's job).
 */
export default async function handle(job: QueuedJob<Record<string, unknown>>, _ctx: JobContext): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('[internal] offer expiry tick received an unscoped payload; skipping')
    return
  }
  const scope = parsed.data

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  const today = new Date().toISOString().slice(0, 10)

  const expiring = await em.find(AnterOffer, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    status: 'issued',
    validUntil: { $lt: today },
    deletedAt: null,
  })

  for (const offer of expiring) {
    offer.status = 'expired'
    await em.flush()

    await emitAnterConfiguratorEvent('anter_configurator.offer.expired', {
      offerId: offer.id,
      offerNumber: offer.offerNumber,
      customerEntityId: offer.customerEntityId ?? null,
      projectId: offer.projectId,
      revisionId: offer.revisionId,
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
    }, { persistent: true, tenantId: scope.tenantId, organizationId: scope.organizationId })
  }
}
