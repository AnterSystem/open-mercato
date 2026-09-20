import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.configurator.use'],
  titleKey: 'anter_configurator.portal.submissions.detailTitle',
  title: 'Submission',
}

export default metadata
