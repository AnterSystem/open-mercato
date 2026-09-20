import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.configurator.use'],
  titleKey: 'anter_configurator.portal.workspace.title',
  title: 'Configurator',
}

export default metadata
