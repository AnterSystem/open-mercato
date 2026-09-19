import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.orders.view'],
  titleKey: 'anter_portal.cart.title',
  title: 'Cart',
  nav: {
    label: 'Cart',
    labelKey: 'anter_portal.nav.cart',
    group: 'main',
    order: 20,
    icon: 'shopping-cart',
  },
}

export default metadata
