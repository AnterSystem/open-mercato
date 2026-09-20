import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'

export const ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE = 'anter_configurator_underlays'

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
  async seedDefaults({ em }) {
    // Spec §3.15: a plan underlay is confidential — dedicated non-public
    // partition, never the shared `productsMedia` or a public one.
    const existing = await em.findOne(AttachmentPartition, { code: ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE })
    if (existing) return
    em.persist(em.create(AttachmentPartition, {
      code: ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE,
      title: 'Anter Configurator Underlays',
      description: 'Site plan images uploaded to configurator projects. Confidential — never public.',
      storageDriver: 'local',
      isPublic: false,
      requiresOcr: false,
    }))
    await em.flush()
  },
}

export default setup
