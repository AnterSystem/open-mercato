import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.catalog.view'],
  titleKey: 'anter_portal.catalog.title',
  title: 'Catalogue',
  nav: {
    label: 'Catalogue',
    labelKey: 'anter_portal.nav.catalog',
    group: 'main',
    order: 10,
    icon: 'shopping-bag',
  },
}

export default metadata
