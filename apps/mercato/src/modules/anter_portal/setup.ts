import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultCustomerRoleFeatures: {
    portal_admin: ['portal.catalog.view', 'portal.orders.view', 'portal.orders.create'],
    buyer: ['portal.catalog.view', 'portal.orders.view', 'portal.orders.create'],
    viewer: ['portal.catalog.view', 'portal.orders.view'],
  },
}

export default setup
