import { createHash } from 'node:crypto'
import type { AwilixContainer } from 'awilix'
import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { ANTER_CONFIGURATOR_ABANDONMENT_QUEUE } from './workers/projectAbandonment'
import { ANTER_CONFIGURATOR_OFFER_EXPIRY_QUEUE } from './workers/offerExpiry'

export const ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE = 'anter_configurator_underlays'

const logger = createLogger('anter_configurator').child({ component: 'setup' })

type SchedulerServiceLike = { register: (registration: Record<string, unknown>) => Promise<void> }

function stableScheduleUuid(stableKey: string): string {
  const hex = createHash('sha256').update(stableKey).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Registers the two daily Phase J ticks (project abandonment, offer expiry).
 * Mirrors `example/setup.ts`'s `registerTodoBulkDispatchSchedule` exactly:
 * `scheduler` is an optional peer, so a missing registration or a per-tenant
 * schedule cap degrades to a logged warning rather than failing tenant setup.
 */
async function registerDailySchedules(
  container: AwilixContainer | undefined,
  scope: { tenantId: string; organizationId: string },
): Promise<void> {
  if (!container) return
  const cradle = container as { hasRegistration?: (name: string) => boolean }
  if (typeof cradle.hasRegistration !== 'function' || !cradle.hasRegistration('schedulerService')) return

  const schedulerService = container.resolve('schedulerService') as SchedulerServiceLike
  const jobs = [
    { key: 'project-abandonment', name: 'Anter configurator project abandonment', description: 'Flags drafts idle past the tenant\'s abandonment threshold (A-5).', queue: ANTER_CONFIGURATOR_ABANDONMENT_QUEUE },
    { key: 'offer-expiry', name: 'Anter configurator offer expiry', description: 'Expires issued offers past their valid_until date.', queue: ANTER_CONFIGURATOR_OFFER_EXPIRY_QUEUE },
  ]

  for (const job of jobs) {
    try {
      await schedulerService.register({
        id: stableScheduleUuid(`anter_configurator:${job.key}:${scope.tenantId}:${scope.organizationId}`),
        name: job.name,
        description: job.description,
        scopeType: 'organization',
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        scheduleType: 'interval',
        scheduleValue: '1d',
        timezone: 'UTC',
        targetType: 'queue',
        targetQueue: job.queue,
        targetPayload: scope,
        sourceType: 'module',
        sourceModule: 'anter_configurator',
        isEnabled: true,
      })
    } catch (error) {
      logger.warn(`Failed to register the ${job.key} schedule`, { err: error })
    }
  }
}

export const setup: ModuleSetupConfig = {
  // Spec §3.14: staff features are granted to `admin` and `superadmin` only.
  defaultRoleFeatures: {
    superadmin: ['anter_configurator.*'],
    admin: ['anter_configurator.*'],
  },
  // Spec §3.14: `portal.configurator.use` is necessary to draw; a `viewer`
  // browses and tracks but does not draw. Both roles can see issued offers;
  // only `buyer` can accept one into an order.
  defaultCustomerRoleFeatures: {
    buyer: ['portal.configurator.use', 'portal.offers.view', 'portal.offers.accept'],
    viewer: ['portal.offers.view'],
  },
  async seedDefaults({ em, container, tenantId, organizationId }) {
    // Spec §3.15: a plan underlay is confidential — dedicated non-public
    // partition, never the shared `productsMedia` or a public one.
    const existing = await em.findOne(AttachmentPartition, { code: ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE })
    if (!existing) {
      em.persist(em.create(AttachmentPartition, {
        code: ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE,
        title: 'Anter Configurator Underlays',
        description: 'Site plan images uploaded to configurator projects. Confidential — never public.',
        storageDriver: 'local',
        isPublic: false,
        requiresOcr: false,
      }))
      await em.flush()
    }

    if (tenantId && organizationId) {
      await registerDailySchedules(container, { tenantId, organizationId })
    }
  },
}

export default setup
