import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['anter_orders.*'],
    admin: ['anter_orders.*'],
    employee: ['anter_orders.view', 'anter_orders.manage', 'anter_orders.fulfil'],
  },
}

export default setup
