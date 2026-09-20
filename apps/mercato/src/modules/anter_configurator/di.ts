import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createAnterConfiguratorPricingService } from './services/anterConfiguratorPricingService'
import { createAnterProjectNumberService } from './services/anterProjectNumberService'
import { createAnterSubmissionNumberService } from './services/anterSubmissionNumberService'
import { createAnterOfferNumberService } from './services/anterOfferNumberService'

export const ANTER_CONFIGURATOR_PRICING_SERVICE = 'anterConfiguratorPricingService' as const
export const ANTER_PROJECT_NUMBER_SERVICE = 'anterProjectNumberService' as const
export const ANTER_SUBMISSION_NUMBER_SERVICE = 'anterSubmissionNumberService' as const
export const ANTER_OFFER_NUMBER_SERVICE = 'anterOfferNumberService' as const

export function register(container: AppContainer) {
  container.register({
    // `.proxy()` overrides Awilix CLASSIC injection mode so the factory
    // receives the whole cradle as one object rather than a positional
    // parameter literally named `deps` (see `anter_orders/di.ts` for the full
    // explanation of why this is load-bearing, not decorative).
    [ANTER_CONFIGURATOR_PRICING_SERVICE]: asFunction(createAnterConfiguratorPricingService).scoped().proxy(),
    [ANTER_PROJECT_NUMBER_SERVICE]: asFunction(createAnterProjectNumberService).scoped().proxy(),
    [ANTER_SUBMISSION_NUMBER_SERVICE]: asFunction(createAnterSubmissionNumberService).scoped().proxy(),
    [ANTER_OFFER_NUMBER_SERVICE]: asFunction(createAnterOfferNumberService).scoped().proxy(),
  })
}

export default register
