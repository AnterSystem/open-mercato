import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'

/**
 * `AnterOrder.delivery_address_snapshot` is frozen from the cart at placement
 * (spec Data Model, Sensitive data section) and encrypted at rest, matching
 * `anter_portal:anter_cart`'s policy for the same data.
 */
export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: 'anter_orders:anter_order',
    fields: [{ field: 'delivery_address_snapshot' }],
  },
]

export default defaultEncryptionMaps
