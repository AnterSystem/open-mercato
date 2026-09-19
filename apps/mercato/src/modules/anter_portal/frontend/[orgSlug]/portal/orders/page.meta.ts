import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.orders.view'],
  titleKey: 'anter_portal.orders.title',
  title: 'Orders',
  nav: {
    label: 'Orders',
    labelKey: 'anter_portal.nav.orders',
    group: 'main',
    order: 30,
    icon: 'package',
  },
}

export default metadata
