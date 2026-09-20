import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'

/**
 * `AnterProject.site_address_snapshot` is a postal address — and, when the
 * project serves the partner's own end customer, a third party's address
 * (spec Data Model § Sensitive data). Every read MUST go through
 * `findWithDecryption` / `findOneWithDecryption`.
 */
export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: 'anter_configurator:anter_project',
    fields: [{ field: 'site_address_snapshot' }],
  },
]

export default defaultEncryptionMaps
