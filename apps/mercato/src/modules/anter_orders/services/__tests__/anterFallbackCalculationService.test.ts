import { createAnterFallbackCalculationService } from '../anterFallbackCalculationService'
import type { SalesLineSnapshot } from '@open-mercato/core/modules/sales/lib/types'

function makeLine(overrides: Partial<SalesLineSnapshot> = {}): SalesLineSnapshot {
  return {
    kind: 'product',
    quantity: 1,
    unitPriceNet: 100,
    taxRate: 23,
    ...overrides,
  } as SalesLineSnapshot
}

function calculate(lines: SalesLineSnapshot[]) {
  return createAnterFallbackCalculationService().calculateDocumentTotals({
    documentKind: 'order',
    context: { currencyCode: 'PLN' },
    lines,
  } as never)
}

describe('anterFallbackCalculationService', () => {
  it('reads taxRate as a percent, matching sales.salesCalculationService', async () => {
    const result = await calculate([makeLine({ quantity: 3, unitPriceNet: 833, taxRate: 23 })])

    expect(result.totals.subtotalNetAmount).toBe(2499)
    expect(result.totals.taxTotalAmount).toBe(574.77)
    expect(result.totals.grandTotalGrossAmount).toBe(3073.77)
  })

  it('charges no tax at a zero rate', async () => {
    const result = await calculate([makeLine({ quantity: 2, unitPriceNet: 50, taxRate: 0 })])

    expect(result.totals.taxTotalAmount).toBe(0)
    expect(result.totals.grandTotalGrossAmount).toBe(100)
  })

  it('keeps shipping out of the subtotal but inside the tax total', async () => {
    const result = await calculate([
      makeLine({ quantity: 1, unitPriceNet: 200, taxRate: 23 }),
      makeLine({ kind: 'shipping', quantity: 1, unitPriceNet: 100, taxRate: 23 }),
    ])

    expect(result.totals.subtotalNetAmount).toBe(200)
    expect(result.totals.shippingNetAmount).toBe(100)
    expect(result.totals.taxTotalAmount).toBe(69)
    expect(result.totals.grandTotalNetAmount).toBe(300)
  })
})
