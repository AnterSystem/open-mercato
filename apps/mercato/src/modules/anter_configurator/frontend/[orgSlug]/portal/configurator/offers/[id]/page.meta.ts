import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.offers.view'],
  titleKey: 'anter_configurator.portal.offers.detailTitle',
  title: 'Offer',
}

export default metadata
