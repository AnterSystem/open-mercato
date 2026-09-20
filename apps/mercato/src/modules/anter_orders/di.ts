import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createAnterPartnerTermsService } from './services/anterPartnerTermsService'
import { createAnterPartnerPricingService } from './services/anterPartnerPricingService'
import { createAnterOrderNumberService } from './services/anterOrderNumberService'
import { createAnterOrderReadService } from './services/anterOrderReadService'
import { createAnterPartnerStatsService } from './services/anterPartnerStatsService'
import { createAnterPartnerPriceListScopeService } from './services/anterPartnerPriceListScopeService'
import { registerAnterPartnerPricingResolver } from './lib/pricingResolver'

export const ANTER_PARTNER_TERMS_SERVICE = 'anterPartnerTermsService' as const
export const ANTER_PARTNER_PRICING_SERVICE = 'anterPartnerPricingService' as const
export const ANTER_ORDER_NUMBER_SERVICE = 'anterOrderNumberService' as const
export const ANTER_ORDER_READ_SERVICE = 'anterOrderReadService' as const
export const ANTER_PARTNER_STATS_SERVICE = 'anterPartnerStatsService' as const
export const ANTER_PARTNER_PRICE_LIST_SCOPE_SERVICE = 'anterPartnerPriceListScopeService' as const

// Runs once per module import (module-level side effect), not per request —
// `registerCatalogPricingResolver` has no dedup key, so calling it from inside
// `register()` below (which runs on every `createRequestContainer()` call)
// would push a duplicate resolver on every request.
registerAnterPartnerPricingResolver()

export function register(container: AppContainer) {
  container.register({
    // `.proxy()` is load-bearing here, not decorative: the container's
    // default injection mode is CLASSIC (packages/shared/src/lib/di/
    // container.ts), which resolves a factory's dependencies by parsing its
    // parameter NAMES and calling it positionally — `createXxxService(deps)`
    // has exactly one param literally named `deps`, so CLASSIC mode tries to
    // resolve a cradle entry called "deps" and throws. `.proxy()` overrides
    // the resolver to pass the whole cradle as that single argument instead,
    // which is what every factory below actually destructures. Verified
    // against a standalone Awilix repro before applying (this codebase's own
    // `catalog/di.ts` uses the identical `.proxy()` override for the same
    // single-object-param shape).
    [ANTER_PARTNER_TERMS_SERVICE]: asFunction(createAnterPartnerTermsService).scoped().proxy(),
    [ANTER_PARTNER_PRICING_SERVICE]: asFunction(createAnterPartnerPricingService).scoped().proxy(),
    [ANTER_ORDER_NUMBER_SERVICE]: asFunction(createAnterOrderNumberService).scoped().proxy(),
    [ANTER_ORDER_READ_SERVICE]: asFunction(createAnterOrderReadService).scoped().proxy(),
    [ANTER_PARTNER_STATS_SERVICE]: asFunction(createAnterPartnerStatsService).scoped().proxy(),
    [ANTER_PARTNER_PRICE_LIST_SCOPE_SERVICE]: asFunction(createAnterPartnerPriceListScopeService).scoped().proxy(),
  })
}

export default register
