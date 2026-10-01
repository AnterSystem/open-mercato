import { createHash, randomUUID } from 'node:crypto'
import type { AwilixContainer } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { CustomFieldEntityConfig } from '@open-mercato/core/modules/entities/data/entities'
import type { CustomFieldsetDefinition, EntityFieldsetConfig } from '@open-mercato/core/modules/entities/lib/fieldsets'
import { ANTER_CONFIGURATOR_ABANDONMENT_QUEUE } from './workers/projectAbandonment'
import { ANTER_CONFIGURATOR_OFFER_EXPIRY_QUEUE } from './workers/offerExpiry'

export const ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE = 'anter_configurator_underlays'

const CATALOG_PRODUCT_ENTITY_ID = 'catalog:catalog_product'

export const ANTER_GEOMETRY_FIELDSET_CODE = 'anter_geometry'

/**
 * Spec §3.3 / C11: the geometry layer lives on the catalogue product record,
 * so it needs a fieldset on the product form. `ce.ts` can declare the FIELDS
 * (`CustomEntitySpec` has no fieldsets key) but nothing declares the SECTION
 * they belong to — without this row the fields install and stay unreachable,
 * because the form only renders fieldsets listed in the entity config.
 */
const ANTER_GEOMETRY_FIELDSET: CustomFieldsetDefinition = {
  code: ANTER_GEOMETRY_FIELDSET_CODE,
  label: 'Configurator geometry',
  icon: 'solar:ruler-linear',
  description: 'Drawing kind, module length, posts and anchors — what the configurator needs to turn a drawing into a bill of materials.',
  groups: [{ code: 'anter_geometry', title: 'Configurator geometry' }],
}

const logger = createLogger('anter_configurator').child({ component: 'setup' })

type SchedulerServiceLike = { register: (registration: Record<string, unknown>) => Promise<void> }

function stableScheduleUuid(stableKey: string): string {
  const hex = createHash('sha256').update(stableKey).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Adds the geometry fieldset to the catalogue product's entity config.
 *
 * Deliberately a MERGE, not the wholesale overwrite `catalog/seed/examples.ts`
 * does: that row is shared with the catalogue's own example fieldsets, and
 * replacing `configJson.fieldsets` would delete them. Re-running is a no-op.
 */
export async function ensureGeometryFieldset(
  em: EntityManager,
  scope: { tenantId?: string | null; organizationId?: string | null },
): Promise<void> {
  const now = new Date()
  const organizationId = scope.organizationId ?? null
  const tenantId = scope.tenantId ?? null

  let config = await em.findOne(CustomFieldEntityConfig, {
    entityId: CATALOG_PRODUCT_ENTITY_ID,
    organizationId,
    tenantId,
  })
  if (!config) {
    config = em.create(CustomFieldEntityConfig, {
      id: randomUUID(),
      entityId: CATALOG_PRODUCT_ENTITY_ID,
      organizationId,
      tenantId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
  }

  const current = (config.configJson ?? {}) as Partial<EntityFieldsetConfig>
  const fieldsets = Array.isArray(current.fieldsets) ? [...current.fieldsets] : []
  const existingIndex = fieldsets.findIndex((fieldset) => fieldset?.code === ANTER_GEOMETRY_FIELDSET_CODE)
  if (existingIndex >= 0) fieldsets[existingIndex] = ANTER_GEOMETRY_FIELDSET
  else fieldsets.push(ANTER_GEOMETRY_FIELDSET)

  config.configJson = {
    ...current,
    fieldsets,
    singleFieldsetPerRecord: current.singleFieldsetPerRecord ?? true,
  }
  config.isActive = true
  config.updatedAt = now
  em.persist(config)
  await em.flush()
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

    await ensureGeometryFieldset(em as EntityManager, { tenantId, organizationId })

    if (tenantId && organizationId) {
      await registerDailySchedules(container, { tenantId, organizationId })
    }
  },
}

export default setup
