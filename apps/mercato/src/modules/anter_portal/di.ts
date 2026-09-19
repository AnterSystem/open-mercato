import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createAnterCatalogService } from './services/anterCatalogService'
import { createAnterCartService } from './services/anterCartService'

export const ANTER_CATALOG_SERVICE = 'anterCatalogService' as const
export const ANTER_CART_SERVICE = 'anterCartService' as const

export function register(container: AppContainer) {
  container.register({
    // Both services destructure `em` / `catalogPricingService` /
    // `anterPartnerTermsService` / `anterPartnerPricingService` straight off
    // the Awilix cradle — `catalogPricingService` from `catalog`'s di.ts,
    // the Anter ones from `anter_orders`'s di.ts (a hard dependency, §3.9).
    [ANTER_CATALOG_SERVICE]: asFunction(createAnterCatalogService).scoped(),
    [ANTER_CART_SERVICE]: asFunction(createAnterCartService).scoped(),
  })
}

export default register
