import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'

/**
 * `AnterCart.delivery_address_snapshot` (added in a later Phase-A step) holds a
 * point-in-time copy of the delivery address for the cart/checkout flow and is
 * encrypted at rest, matching the customer address encryption policy.
 */
export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: 'anter_portal:anter_cart',
    fields: [{ field: 'delivery_address_snapshot' }],
  },
]

export default defaultEncryptionMaps
