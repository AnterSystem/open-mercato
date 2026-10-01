export const metadata = {
  requireAuth: true,
  // Reading the queue is a `view` right; pricing a line needs
  // `anter_configurator.value` and is gated on the action itself (spec §3.14).
  requireFeatures: ['anter_configurator.view'],
  pageTitle: 'Custom items',
  pageTitleKey: 'anter_configurator.customItems.title',
  pageGroup: 'Anter',
  pageGroupKey: 'anter_configurator.nav.group',
  pageOrder: 230,
  icon: 'circle-dollar-sign',
} as const
