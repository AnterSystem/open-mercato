import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { SalesLineSnapshot } from '@open-mercato/core/modules/sales/lib/types'
import { CatalogProduct } from '@open-mercato/core/modules/catalog/data/entities'
import { createAnterFallbackCalculationService, type OrderCalculationService } from '../../anter_orders/services/anterFallbackCalculationService'
import type { CartLineView } from '../services/anterCartService'

export type CartTotals = {
  subtotalNetAmount: number
  discountTotalAmount: number
  shippingNetAmount: number
  taxTotalAmount: number
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
}

/**
 * Resolves `sales.salesCalculationService`, falling back to the same
 * degraded arithmetic `anter_orders.order.place` uses when `sales` is
 * disabled (module-absent behaviour, spec §3.9/§Implementation Plan step 16
 * — the fallback is shared rather than re-derived per caller).
 */
export function resolveCalculationService(container: AppContainer): OrderCalculationService {
  try {
    const service = container.resolve<OrderCalculationService>('salesCalculationService')
    if (service && typeof service.calculateDocumentTotals === 'function') return service
  } catch {
    // Soft-optional peer — degrade to the fallback below.
  }
  return createAnterFallbackCalculationService()
}

/**
 * Cart totals via the SAME call the checkout flow re-prices with (§3.5) —
 * `salesCalculationService.calculateDocumentTotals`, never a re-derived sum —
 * so the cart summary and the placed order cannot disagree.
 *
 * Shipping is deliberately `0`: no shipping-rate service exists yet in this
 * slice (D7/R6 — the operator-entered split-cost panel is Phase C), so the
 * indicative figure s37 describes is not yet computable. The shipping line
 * is still included (kind: 'shipping') so the response shape matches the
 * order's once a real rate lands, rather than changing shape later.
 */
export async function computeCartTotals(
  container: AppContainer,
  em: EntityManager,
  scope: { organizationId: string; tenantId: string },
  currencyCode: string,
  lines: CartLineView[],
): Promise<CartTotals> {
  const calculationService = resolveCalculationService(container)

  const productIds = Array.from(new Set(lines.map((line) => line.productId)))
  const products = productIds.length
    ? await em.find(CatalogProduct, {
        id: { $in: productIds },
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
      })
    : []
  const taxRateByProduct = new Map(products.map((product) => [product.id, product.taxRate != null ? Number(product.taxRate) : 0]))

  const productLines: SalesLineSnapshot[] = lines.map((line) => ({
    kind: 'product',
    productId: line.productId,
    productVariantId: line.productVariantId,
    name: line.nameSnapshot,
    quantity: line.quantity,
    currencyCode,
    unitPriceNet: line.partnerUnitPriceNet ?? 0,
    taxRate: taxRateByProduct.get(line.productId) ?? 0,
  }))
  const shippingLine: SalesLineSnapshot = {
    kind: 'shipping',
    name: 'Shipping',
    quantity: 1,
    currencyCode,
    unitPriceNet: 0,
    taxRate: 0,
  }

  const calculation = await calculationService.calculateDocumentTotals({
    documentKind: 'order',
    lines: productLines.length ? [...productLines, shippingLine] : [],
    context: { tenantId: scope.tenantId, organizationId: scope.organizationId, currencyCode },
  })

  return {
    subtotalNetAmount: calculation.totals.subtotalNetAmount,
    discountTotalAmount: calculation.totals.discountTotalAmount ?? 0,
    shippingNetAmount: calculation.totals.shippingNetAmount ?? 0,
    taxTotalAmount: calculation.totals.taxTotalAmount ?? 0,
    grandTotalNetAmount: calculation.totals.grandTotalNetAmount,
    grandTotalGrossAmount: calculation.totals.grandTotalGrossAmount,
  }
}

export default computeCartTotals
