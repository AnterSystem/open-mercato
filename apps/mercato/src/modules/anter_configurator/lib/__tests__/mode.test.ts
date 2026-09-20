import { redactBomForMode } from '../mode'

describe('redactBomForMode (spec §3.7 rule 2)', () => {
  const bom = {
    bomTotalNetAmount: 2300,
    lines: [
      { id: 'line-1', priceState: 'priced', partnerUnitPriceNet: 100, listUnitPriceNet: 120, netAmount: 2300, discountRate: 0.1, unitCostNet: 80, quantity: 23 },
      { id: 'line-2', priceState: 'to_quote', quantity: 5 },
    ],
  }

  it('leaves a partner_priced response untouched', () => {
    expect(redactBomForMode(bom, 'partner_priced')).toBe(bom)
  })

  it('strips every price/cost/margin key for partner_unpriced, even on an already-priced line', () => {
    const redacted = redactBomForMode(bom, 'partner_unpriced')
    expect(redacted).not.toHaveProperty('bomTotalNetAmount')
    const [pricedLine, toQuoteLine] = redacted!.lines!
    expect(pricedLine).not.toHaveProperty('partnerUnitPriceNet')
    expect(pricedLine).not.toHaveProperty('listUnitPriceNet')
    expect(pricedLine).not.toHaveProperty('netAmount')
    expect(pricedLine).not.toHaveProperty('discountRate')
    expect(pricedLine).not.toHaveProperty('unitCostNet')
    // Non-price fields survive — the redaction is keyed by mode, not by priceState.
    expect(pricedLine.id).toBe('line-1')
    expect(pricedLine.quantity).toBe(23)
    expect(toQuoteLine.priceState).toBe('to_quote')
  })

  it('passes through null/undefined unchanged', () => {
    expect(redactBomForMode(null, 'partner_unpriced')).toBeNull()
    expect(redactBomForMode(undefined, 'partner_unpriced')).toBeUndefined()
  })
})
