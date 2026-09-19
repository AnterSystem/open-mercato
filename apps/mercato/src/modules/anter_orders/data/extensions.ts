import type { EntityExtension } from '@open-mercato/shared/modules/entities'

const entityExtensions: EntityExtension[] = [
  {
    base: 'customers:customer_entity',
    extension: 'anter_orders:anter_partner_terms',
    join: { baseKey: 'id', extensionKey: 'customer_entity_id' },
    cardinality: 'one-to-one',
    description: 'Partner ordering terms (discount rate, blocked flag) for a customer entity.',
  },
]

export const extensions = entityExtensions
export default entityExtensions
