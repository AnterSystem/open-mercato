import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

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
}

export default setup
