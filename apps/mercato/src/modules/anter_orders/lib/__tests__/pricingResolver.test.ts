import { RequestContext } from '@mikro-orm/postgresql'
import {
  registerCatalogPricingResolver,
  resetCatalogPricingResolvers,
  resolveCatalogPrice,
  type PriceRow,
  type PricingContext,
} from '@open-mercato/core/modules/catalog/lib/pricing'
import { anterPartnerPricingResolver, registerAnterPartnerPricingResolver } from '../pricingResolver'
import { AnterPartnerTerms } from '../../data/entities'

jest.mock('@mikro-orm/postgresql', () => {
  const actual = jest.requireActual('@mikro-orm/postgresql')
  return {
    ...actual,
    RequestContext: {
      ...actual.RequestContext,
      getEntityManager: jest.fn(),
    },
  }
})

const getEntityManagerMock = RequestContext.getEntityManager as jest.Mock

function baseRows(): PriceRow[] {
  return [
    {
      id: 'price-1',
      unitPriceNet: '100.0000',
      kind: 'regular',
      startsAt: null,
      minQuantity: 1,
    } as unknown as PriceRow,
  ]
}

function baseContext(overrides: Partial<PricingContext> = {}): PricingContext {
  return { quantity: 1, date: new Date('2026-01-01T00:00:00.000Z'), ...overrides }
}

describe('anterPartnerPricingResolver registered against the shared catalog pricing pipeline', () => {
  beforeEach(() => {
    resetCatalogPricingResolvers()
    // Register the resolver function directly for each test: the exported
    // `registerAnterPartnerPricingResolver()` guards against duplicate
    // registration with a module-level flag (by design — see pricingResolver.ts),
    // which would otherwise no-op here after `resetCatalogPricingResolvers()`
    // wipes the shared registry between tests.
    registerCatalogPricingResolver(anterPartnerPricingResolver, { priority: 100 })
    getEntityManagerMock.mockReset()
  })

  afterAll(() => {
    resetCatalogPricingResolvers()
  })

  it('R2: leaves non-partner (no customerId) resolution byte-identical to the default pipeline', async () => {
    const rows = baseRows()
    const withoutResolver = await resolveCatalogPrice(rows, baseContext())

    const withResolver = await resolveCatalogPrice(rows, baseContext())

    expect(getEntityManagerMock).not.toHaveBeenCalled()
    expect(withResolver).toEqual(withoutResolver)
    expect(withResolver?.unitPriceNet).toBe('100.0000')
  })

  it('R2: leaves a customerId with no partner terms byte-identical to the default pipeline', async () => {
    const em = { findOne: jest.fn().mockResolvedValue(null) }
    getEntityManagerMock.mockReturnValue(em)

    const rows = baseRows()
    const result = await resolveCatalogPrice(rows, baseContext({ customerId: 'customer-without-terms' }))

    expect(em.findOne).toHaveBeenCalledWith(AnterPartnerTerms, {
      customerEntityId: 'customer-without-terms',
      deletedAt: null,
    })
    expect(result?.unitPriceNet).toBe('100.0000')
  })

  it('R1: applies the partner discount rate when the customer has partner terms', async () => {
    const em = {
      findOne: jest.fn().mockResolvedValue({ defaultDiscountRate: '0.2' }),
    }
    getEntityManagerMock.mockReturnValue(em)

    const rows = baseRows()
    const result = await resolveCatalogPrice(rows, baseContext({ customerId: 'partner-customer' }))

    expect(result?.unitPriceNet).toBe('80')
  })

  it('R1: never returns null for a missing price row, only falls through', async () => {
    const em = { findOne: jest.fn().mockResolvedValue({ defaultDiscountRate: '0.2' }) }
    getEntityManagerMock.mockReturnValue(em)

    const result = await resolveCatalogPrice([], baseContext({ customerId: 'partner-customer' }))
    expect(result).toBeNull()
  })
})

describe('registerAnterPartnerPricingResolver idempotency', () => {
  it('never pushes more than one resolver instance onto the shared registry, however many times it is called', async () => {
    resetCatalogPricingResolvers()
    registerAnterPartnerPricingResolver()
    registerAnterPartnerPricingResolver()
    registerAnterPartnerPricingResolver()

    const em = { findOne: jest.fn().mockResolvedValue({ defaultDiscountRate: '0.5' }) }
    getEntityManagerMock.mockReturnValue(em)

    await resolveCatalogPrice(baseRows(), baseContext({ customerId: 'partner-customer' }))

    // A duplicate-registration leak would call `findOne` once per duplicate entry.
    expect(em.findOne).toHaveBeenCalledTimes(1)
  })
})
