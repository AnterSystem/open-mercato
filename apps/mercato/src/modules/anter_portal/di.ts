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
    // `anterCheckoutService` (in ./services/anterCheckoutService.ts) is NOT
    // registered here: it needs the raw request container itself (to
    // soft-optionally resolve `salesCalculationService` and to build the
    // `CommandRuntimeContext` for `commandBus.execute`), which Awilix's
    // CLASSIC-mode cradle has no self-reference for. It's constructed
    // directly by the checkout route, which already holds that container —
    // the same reason `lib/cartTotals.ts` takes `container` as a plain
    // function argument instead of being DI-registered.
    // `.proxy()` is load-bearing — see the identical note in
    // `anter_orders/di.ts`. Without it, the container's default CLASSIC
    // injection mode tries to resolve a cradle entry literally named "deps"
    // (the factories' single parameter name) and throws at first resolution.
    [ANTER_CATALOG_SERVICE]: asFunction(createAnterCatalogService).scoped().proxy(),
    [ANTER_CART_SERVICE]: asFunction(createAnterCartService).scoped().proxy(),
  })
}

export default register
