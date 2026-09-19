import { createAnterPartnerPricingService } from '../anterPartnerPricingService'
import { CatalogProductPrice } from '@open-mercato/core/modules/catalog/data/entities'
import { AnterPartnerGroupDiscount } from '../../data/entities'
import type { AnterPartnerTermsRecord } from '../anterPartnerTermsService'

const scope = { organizationId: 'org-1', tenantId: 'tenant-1' }

const terms: AnterPartnerTermsRecord = {
  id: 'terms-1',
  customerEntityId: 'customer-1',
  defaultDiscountRate: 0.1,
  priceListCode: 'PL-1',
  isBlocked: false,
}

function makeEm(priceRows: unknown[], groupDiscountRows: unknown[]) {
  const find = jest.fn().mockImplementation(async (entity: unknown) => {
    if (entity === CatalogProductPrice) return priceRows
    if (entity === AnterPartnerGroupDiscount) return groupDiscountRows
    return []
  })
  return { find } as unknown as import('@mikro-orm/postgresql').EntityManager
}

describe('anterPartnerPricingService.resolvePartnerPrice', () => {
  const productId = 'product-1'
  const at = new Date('2026-01-01T00:00:00.000Z')

  it('applies the category group-discount rate when one matches, overriding the default rate', async () => {
    const em = makeEm(
      [{ unitPriceNet: '100.0000', kind: 'regular', startsAt: null, minQuantity: 1 }],
      [{ discountRate: '0.25', categoryId: 'cat-1' }],
    )
    const service = createAnterPartnerPricingService({ em })

    const result = await service.resolvePartnerPrice({
      productId,
      variantId: null,
      categoryIds: ['cat-1'],
      terms,
      quantity: 1,
      currencyCode: 'EUR',
      at,
      scope,
    })

    expect(result.listUnitPriceNet).toBe(100)
    expect(result.discountRate).toBe(0.25)
    expect(result.partnerUnitPriceNet).toBe(75)
  })

  it('falls back to the partner default discount rate when no group discount matches', async () => {
    const em = makeEm(
      [{ unitPriceNet: '50.0000', kind: 'regular', startsAt: null, minQuantity: 1 }],
      [],
    )
    const service = createAnterPartnerPricingService({ em })

    const result = await service.resolvePartnerPrice({
      productId,
      variantId: null,
      categoryIds: [],
      terms,
      quantity: 1,
      currencyCode: 'EUR',
      at,
      scope,
    })

    expect(result.listUnitPriceNet).toBe(50)
    expect(result.discountRate).toBe(0.1)
    expect(result.partnerUnitPriceNet).toBe(45)
  })

  it('resolves to zero discount when there is no group discount and no default rate', async () => {
    const em = makeEm(
      [{ unitPriceNet: '20.0000', kind: 'regular', startsAt: null, minQuantity: 1 }],
      [],
    )
    const service = createAnterPartnerPricingService({ em })

    const result = await service.resolvePartnerPrice({
      productId,
      variantId: null,
      categoryIds: [],
      terms: { ...terms, defaultDiscountRate: 0 },
      quantity: 1,
      currencyCode: 'EUR',
      at,
      scope,
    })

    expect(result.listUnitPriceNet).toBe(20)
    expect(result.discountRate).toBe(0)
    expect(result.partnerUnitPriceNet).toBe(20)
  })

  it('returns null prices when there is no list price row at all', async () => {
    const em = makeEm([], [])
    const service = createAnterPartnerPricingService({ em })

    const result = await service.resolvePartnerPrice({
      productId,
      variantId: null,
      categoryIds: [],
      terms,
      quantity: 1,
      currencyCode: 'EUR',
      at,
      scope,
    })

    expect(result.listUnitPriceNet).toBeNull()
    expect(result.partnerUnitPriceNet).toBeNull()
  })
})
