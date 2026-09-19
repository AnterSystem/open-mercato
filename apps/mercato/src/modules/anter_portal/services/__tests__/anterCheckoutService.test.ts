import { createAnterCheckoutService } from '../anterCheckoutService'
import { AnterCart, AnterCartLine } from '../../data/entities'
import {
  CatalogProduct,
  CatalogProductPrice,
  CatalogProductCategoryAssignment,
} from '@open-mercato/core/modules/catalog/data/entities'

const scope = { organizationId: 'org-1', tenantId: 'tenant-1' }
const principal = { customerEntityId: 'customer-1', customerUserId: 'user-1' }

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/anter_portal/checkout', { method: 'POST', headers })
}

function makeCart(overrides: Partial<AnterCart> = {}): AnterCart {
  return {
    id: 'cart-1',
    status: 'active',
    currencyCode: 'PLN',
    deliveryMode: 'self_collection',
    deliveryAddressSnapshot: null,
    partnerReference: null,
    notes: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as AnterCart
}

function makeLine(overrides: Partial<AnterCartLine> = {}): AnterCartLine {
  return {
    id: 'line-1',
    cartId: 'cart-1',
    productId: 'product-1',
    productVariantId: null,
    sku: 'GATE-1',
    nameSnapshot: 'Gate opener',
    variantSnapshot: null,
    quantity: '2',
    unitCode: 'pcs',
    listUnitPriceNet: '100.0000',
    partnerUnitPriceNet: '80.0000',
    discountRate: '0.2',
    currencyCode: 'PLN',
    ...overrides,
  } as AnterCartLine
}

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return { id: 'product-1', title: 'Gate opener', sku: 'GATE-1', isQuoteOnly: false, taxRate: '0.23', ...overrides } as CatalogProduct
}

type MockEmOptions = {
  findOneByEntity?: Map<unknown, unknown>
  findByEntity?: Map<unknown, unknown[]>
}

function makeEm(options: MockEmOptions = {}) {
  const findOneByEntity = options.findOneByEntity ?? new Map()
  const findByEntity = options.findByEntity ?? new Map()
  return {
    findOne: jest.fn(async (Entity: unknown) => findOneByEntity.get(Entity) ?? null),
    find: jest.fn(async (Entity: unknown) => findByEntity.get(Entity) ?? []),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
  } as unknown as import('@mikro-orm/postgresql').EntityManager
}

function makeContainer(overrides: Record<string, unknown> = {}) {
  return {
    resolve: jest.fn((key: string) => {
      if (key in overrides) return overrides[key]
      throw new Error(`not registered: ${key}`)
    }),
  } as unknown as import('@open-mercato/shared/lib/di/container').AppContainer
}

const noDiscountTerms = { getByCustomerEntityId: jest.fn(async () => null) }

function catalogPricingService(rows: Array<{ unitPriceNet: number } | null>) {
  return { resolvePriceMany: jest.fn(async () => rows) }
}

describe('anterCheckoutService.placeOrder', () => {
  it('rejects checkout with a blocked partner account', async () => {
    const cart = makeCart()
    const em = makeEm({ findOneByEntity: new Map<unknown, unknown>([[AnterCart, cart]]) })
    const service = createAnterCheckoutService({
      em,
      container: makeContainer(),
      catalogPricingService: catalogPricingService([{ unitPriceNet: 100 }]) as never,
      anterPartnerTermsService: { getByCustomerEntityId: jest.fn(async () => ({ id: 'terms-1', customerEntityId: principal.customerEntityId, defaultDiscountRate: 0, priceListCode: null, isBlocked: true })) },
    })

    await expect(service.placeOrder(scope, principal, makeRequest(), {}))
      .rejects.toMatchObject({ status: 403, body: { error: 'ordering_blocked' } })
  })

  it('rejects checkout with an empty cart', async () => {
    const cart = makeCart()
    const em = makeEm({
      findOneByEntity: new Map<unknown, unknown>([[AnterCart, cart]]),
      findByEntity: new Map([[AnterCartLine, []]]),
    })
    const service = createAnterCheckoutService({
      em,
      container: makeContainer(),
      catalogPricingService: catalogPricingService([]) as never,
      anterPartnerTermsService: noDiscountTerms as never,
    })

    await expect(service.placeOrder(scope, principal, makeRequest(), {}))
      .rejects.toMatchObject({ status: 422 })
  })

  it('rejects checkout when the cart has no delivery mode set', async () => {
    const cart = makeCart({ deliveryMode: null })
    const line = makeLine()
    const em = makeEm({
      findOneByEntity: new Map<unknown, unknown>([[AnterCart, cart]]),
      findByEntity: new Map([[AnterCartLine, [line]]]),
    })
    const service = createAnterCheckoutService({
      em,
      container: makeContainer(),
      catalogPricingService: catalogPricingService([{ unitPriceNet: 100 }]) as never,
      anterPartnerTermsService: noDiscountTerms as never,
    })

    await expect(service.placeOrder(scope, principal, makeRequest(), {}))
      .rejects.toMatchObject({ status: 422 })
  })

  it('rejects checkout with 409 when a line re-prices differently than the cart displayed', async () => {
    const cart = makeCart()
    const line = makeLine({ partnerUnitPriceNet: '80.0000' }) // cart shows 80, catalogue now resolves to 100 list * no discount = 100
    const product = makeProduct()
    const em = makeEm({
      findOneByEntity: new Map<unknown, unknown>([[AnterCart, cart]]),
      findByEntity: new Map<unknown, unknown[]>([
        [AnterCartLine, [line]],
        [CatalogProduct, [product]],
        [CatalogProductPrice, []],
        [CatalogProductCategoryAssignment, []],
      ]),
    })
    const service = createAnterCheckoutService({
      em,
      container: makeContainer(),
      // Fresh resolution disagrees with the cart's stored 80 (no discount now).
      catalogPricingService: catalogPricingService([{ unitPriceNet: 100 }]) as never,
      anterPartnerTermsService: noDiscountTerms as never,
    })

    await expect(service.placeOrder(scope, principal, makeRequest(), {}))
      .rejects.toMatchObject({
        status: 409,
        body: {
          error: 'price_changed',
          changedLines: [{ lineId: 'line-1', previousUnitPriceNet: '80.00', currentUnitPriceNet: '100.00' }],
        },
      })
  })

  it('places the order and converts the cart when re-pricing agrees with the cart', async () => {
    const cart = makeCart()
    const line = makeLine({ partnerUnitPriceNet: '100.0000' })
    const product = makeProduct()
    const em = makeEm({
      findOneByEntity: new Map<unknown, unknown>([[AnterCart, cart]]),
      findByEntity: new Map<unknown, unknown[]>([
        [AnterCartLine, [line]],
        [CatalogProduct, [product]],
        [CatalogProductPrice, []],
        [CatalogProductCategoryAssignment, []],
      ]),
    })
    const commandResult = { orderId: 'order-1', orderNumber: 'ANT-0001', status: 'placed', grandTotalNetAmount: 200, grandTotalGrossAmount: 246 }
    const commandBus = { execute: jest.fn(async () => ({ result: commandResult, logEntry: null })) }
    const service = createAnterCheckoutService({
      em,
      container: makeContainer({ commandBus }),
      catalogPricingService: catalogPricingService([{ unitPriceNet: 100 }]) as never,
      anterPartnerTermsService: noDiscountTerms as never,
    })

    const result = await service.placeOrder(scope, principal, makeRequest(), { partnerReference: 'PO-42' })

    expect(result).toEqual(commandResult)
    expect(commandBus.execute).toHaveBeenCalledWith('anter_orders.order.place', expect.objectContaining({
      input: expect.objectContaining({ partnerReference: 'PO-42', sourceCartId: 'cart-1' }),
    }))
    expect(cart.status).toBe('converted')
    expect(cart.convertedOrderId).toBe('order-1')
  })

  it('rejects checkout with a stale expected-updated-at header (optimistic lock)', async () => {
    const cart = makeCart({ updatedAt: new Date('2026-01-01T00:00:00.000Z') })
    const em = makeEm({ findOneByEntity: new Map<unknown, unknown>([[AnterCart, cart]]) })
    const service = createAnterCheckoutService({
      em,
      container: makeContainer(),
      catalogPricingService: catalogPricingService([]) as never,
      anterPartnerTermsService: noDiscountTerms as never,
    })
    const staleRequest = makeRequest({ 'x-om-ext-optimistic-lock-expected-updated-at': new Date('2025-01-01T00:00:00.000Z').toISOString() })

    await expect(service.placeOrder(scope, principal, staleRequest, {}))
      .rejects.toMatchObject({ status: 409, body: { code: 'optimistic_lock_conflict' } })
  })
})
