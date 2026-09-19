import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.catalog.view'],
  titleKey: 'anter_portal.catalog.detail.title',
  title: 'Product',
}

export default metadata
