import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.configurator.use'],
  titleKey: 'anter_configurator.portal.projects.title',
  title: 'Configurator',
  nav: {
    label: 'Configurator',
    labelKey: 'anter_configurator.nav.portalProjects',
    group: 'main',
    order: 25,
    icon: 'ruler',
  },
}

export default metadata
