import type {
  CalculateDocumentOptions,
  SalesDocumentCalculationResult,
  SalesLineCalculationResult,
} from '@open-mercato/core/modules/sales/lib/types'

export type OrderCalculationService = {
  calculateDocumentTotals(
    opts: Omit<CalculateDocumentOptions, 'eventBus'>,
  ): Promise<SalesDocumentCalculationResult>
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * Degraded stand-in for `sales.salesCalculationService` (spec Implementation
 * Plan step 16, "module-absent" behavior). Used only when the `sales` module
 * is disabled/uninstalled — `anter_orders.order.place` resolves the real
 * service first and falls back to this only on a failed DI resolve.
 *
 * Deliberately minimal: net = unitPriceNet * quantity, tax = net * the
 * line's own single taxRate, no cross-line adjustments/promotions/discount
 * engine. This matches the spec's "no adjustments, single tax rate" framing
 * for the absent-module path — it is not a substitute for the real engine.
 */
export function createAnterFallbackCalculationService(): OrderCalculationService {
  return {
    async calculateDocumentTotals(opts) {
      const lines: SalesLineCalculationResult[] = opts.lines.map((line) => {
        const quantity = line.quantity
        const unitPriceNet = line.unitPriceNet ?? 0
        const taxRate = line.taxRate ?? 0
        const netAmount = round(unitPriceNet * quantity)
        const taxAmount = round(netAmount * taxRate)
        const grossAmount = round(netAmount + taxAmount)
        return {
          line,
          netAmount,
          grossAmount,
          taxAmount,
          discountAmount: 0,
          adjustments: [],
        }
      })

      const productLines = lines.filter((entry) => entry.line.kind !== 'shipping')
      const shippingLines = lines.filter((entry) => entry.line.kind === 'shipping')

      const subtotalNetAmount = round(productLines.reduce((sum, entry) => sum + entry.netAmount, 0))
      const subtotalGrossAmount = round(productLines.reduce((sum, entry) => sum + entry.grossAmount, 0))
      const shippingNetAmount = round(shippingLines.reduce((sum, entry) => sum + entry.netAmount, 0))
      const shippingGrossAmount = round(shippingLines.reduce((sum, entry) => sum + entry.grossAmount, 0))
      const taxTotalAmount = round(lines.reduce((sum, entry) => sum + entry.taxAmount, 0))

      return {
        kind: opts.documentKind,
        currencyCode: opts.context.currencyCode,
        lines,
        adjustments: [],
        totals: {
          subtotalNetAmount,
          subtotalGrossAmount,
          discountTotalAmount: 0,
          taxTotalAmount,
          shippingNetAmount,
          shippingGrossAmount,
          grandTotalNetAmount: round(subtotalNetAmount + shippingNetAmount),
          grandTotalGrossAmount: round(subtotalGrossAmount + shippingGrossAmount),
        },
        metadata: {},
      }
    },
  }
}

export default createAnterFallbackCalculationService
