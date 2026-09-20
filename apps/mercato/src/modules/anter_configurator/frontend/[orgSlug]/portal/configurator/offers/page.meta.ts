import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.offers.view'],
  titleKey: 'anter_configurator.portal.offers.title',
  title: 'My offers',
  nav: {
    label: 'My offers',
    labelKey: 'anter_configurator.portal.offers.title',
    group: 'main',
    order: 27,
    icon: 'file-text',
  },
}

export default metadata
