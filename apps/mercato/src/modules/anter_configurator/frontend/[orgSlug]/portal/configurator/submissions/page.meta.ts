import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.configurator.use'],
  titleKey: 'anter_configurator.portal.submissions.title',
  title: 'My submissions',
  nav: {
    label: 'My submissions',
    labelKey: 'anter_configurator.portal.submissions.title',
    group: 'main',
    order: 26,
    icon: 'inbox',
  },
}

export default metadata
