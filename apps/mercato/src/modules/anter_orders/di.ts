import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createAnterPartnerTermsService } from './services/anterPartnerTermsService'
import { createAnterPartnerPricingService } from './services/anterPartnerPricingService'
import { createAnterOrderNumberService } from './services/anterOrderNumberService'
import { registerAnterPartnerPricingResolver } from './lib/pricingResolver'

export const ANTER_PARTNER_TERMS_SERVICE = 'anterPartnerTermsService' as const
export const ANTER_PARTNER_PRICING_SERVICE = 'anterPartnerPricingService' as const
export const ANTER_ORDER_NUMBER_SERVICE = 'anterOrderNumberService' as const

// Runs once per module import (module-level side effect), not per request —
// `registerCatalogPricingResolver` has no dedup key, so calling it from inside
// `register()` below (which runs on every `createRequestContainer()` call)
// would push a duplicate resolver on every request.
registerAnterPartnerPricingResolver()

export function register(container: AppContainer) {
  container.register({
    [ANTER_PARTNER_TERMS_SERVICE]: asFunction(createAnterPartnerTermsService).scoped(),
    [ANTER_PARTNER_PRICING_SERVICE]: asFunction(createAnterPartnerPricingService).scoped(),
    [ANTER_ORDER_NUMBER_SERVICE]: asFunction(createAnterOrderNumberService).scoped(),
  })
}

export default register
