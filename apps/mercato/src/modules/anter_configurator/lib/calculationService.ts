import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { createAnterFallbackCalculationService, type OrderCalculationService } from '../../anter_orders/services/anterFallbackCalculationService'

const logger = createLogger('anter_configurator').child({ component: 'lib.calculationService' })

/**
 * Resolves the shared `sales.salesCalculationService` when `sales` is
 * enabled, falling back to `anter_orders`' degraded stand-in otherwise —
 * the exact same soft-optional resolve `anter_orders.order.place` uses
 * (§3.11 "one arithmetic, three documents": the offer must total through
 * the identical code path the order does, not a reimplementation).
 */
export function resolveAnterConfiguratorCalculationService(ctx: CommandRuntimeContext): OrderCalculationService {
  try {
    const service = ctx.container.resolve<OrderCalculationService>('salesCalculationService')
    if (service && typeof service.calculateDocumentTotals === 'function') return service
  } catch {
    logger.debug('[internal] salesCalculationService unavailable, using anterFallbackCalculationService')
  }
  return createAnterFallbackCalculationService()
}

export default resolveAnterConfiguratorCalculationService
