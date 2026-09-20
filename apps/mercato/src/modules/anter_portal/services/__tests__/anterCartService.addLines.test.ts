import { createAnterCartService } from '../anterCartService'
import { AnterCart, AnterCartLine } from '../../data/entities'
import { CatalogProduct } from '@open-mercato/core/modules/catalog/data/entities'
import { AnterStockItem } from '../../../anter_orders/data/entities'

const scope = { organizationId: 'org-1', tenantId: 'tenant-1' }
const principal = { customerEntityId: 'customer-1', customerUserId: 'user-1' }

function makeRequest(): Request {
  return new Request('http://localhost/api/anter_portal/cart')
}

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'product-1',
    title: 'Barrier module',
    sku: 'BARRIER-1',
    isQuoteOnly: false,
    defaultSalesUnit: 'pcs',
    defaultUnit: 'pcs',
    ...overrides,
  } as CatalogProduct
}

type MockEmOptions = {
  findOneByEntity?: Map<unknown, unknown>
  findByEntity?: Map<unknown, unknown[]>
}

function makeEm(options: MockEmOptions = {}) {
  const findOneByEntity = options.findOneByEntity ?? new Map()
  const findByEntity = options.findByEntity ?? new Map()
  const created: unknown[] = []

  const em = {
    findOne: jest.fn(async (Entity: unknown) => findOneByEntity.get(Entity) ?? null),
    find: jest.fn(async (Entity: unknown) => findByEntity.get(Entity) ?? []),
    create: jest.fn((Entity: new () => unknown, data: Record<string, unknown>) => {
      const instance = new Entity()
      Object.assign(instance as object, data)
      created.push(instance)
      return instance
    }),
    remove: jest.fn(),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
  }
  return { em: em as unknown as import('@mikro-orm/postgresql').EntityManager, created }
}

const noDiscountTerms = { getByCustomerEntityId: jest.fn(async () => null) }

function pricingService(result: { listUnitPriceNet: number | null; partnerUnitPriceNet: number | null; discountRate: number }) {
  return {
    resolvePartnerPrice: jest.fn(async () => ({ listRow: null, priceListCode: null, ...result })),
  }
}

describe('anterCartService.addLines (spec X13)', () => {
  it('creates every line in one call and bumps the cart version once', async () => {
    const product = makeProduct()
    const stockItem = { onHand: 1000, expectedRestockAt: null } as AnterStockItem
    const cart = { id: 'cart-1', status: 'active', currencyCode: 'PLN', updatedAt: new Date('2026-01-01T00:00:00.000Z') } as AnterCart
    const before = cart.updatedAt

    const { em, created } = makeEm({
      findOneByEntity: new Map<unknown, unknown>([
        [CatalogProduct, product],
        [AnterStockItem, stockItem],
        [AnterCart, cart],
        [AnterCartLine, null],
      ]),
      findByEntity: new Map([[AnterCartLine, []]]),
    })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: 100, partnerUnitPriceNet: 100, discountRate: 0 }) as never,
    })

    const result = await service.addLines(scope, principal, [
      { productId: 'product-barrier', productVariantId: null, quantity: 23 },
      { productId: 'product-post', productVariantId: null, quantity: 24 },
    ], makeRequest())

    expect(result.lines).toHaveLength(2)
    expect(result.lines.every((line) => line.wasCreated)).toBe(true)
    expect(created).toHaveLength(2)
    expect(cart.updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })

  it('rejects the whole batch when any line is quote_only, before writing anything', async () => {
    const product = makeProduct({ isQuoteOnly: true })
    const cart = { id: 'cart-1', status: 'active', currencyCode: 'PLN', updatedAt: new Date() } as AnterCart

    const { em, created } = makeEm({
      findOneByEntity: new Map<unknown, unknown>([[CatalogProduct, product], [AnterCart, cart]]),
      findByEntity: new Map([[AnterCartLine, []]]),
    })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: null, partnerUnitPriceNet: null, discountRate: 0 }) as never,
    })

    await expect(service.addLines(scope, principal, [
      { productId: 'product-1', productVariantId: null, quantity: 1 },
    ], makeRequest())).rejects.toMatchObject({ status: 422, body: { error: 'quote_only' } })
    expect(created).toHaveLength(0)
  })

  it('rejects the whole batch when one line exceeds available stock', async () => {
    const product = makeProduct()
    const stockItem = { onHand: 2, expectedRestockAt: null } as AnterStockItem
    const cart = { id: 'cart-1', status: 'active', currencyCode: 'PLN', updatedAt: new Date() } as AnterCart

    const { em, created } = makeEm({
      findOneByEntity: new Map<unknown, unknown>([
        [CatalogProduct, product],
        [AnterStockItem, stockItem],
        [AnterCart, cart],
      ]),
      findByEntity: new Map([[AnterCartLine, []]]),
    })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: 100, partnerUnitPriceNet: 100, discountRate: 0 }) as never,
    })

    await expect(service.addLines(scope, principal, [
      { productId: 'product-1', productVariantId: null, quantity: 10 },
    ], makeRequest())).rejects.toMatchObject({ status: 409, body: { error: 'out_of_stock' } })
    expect(created).toHaveLength(0)
  })
})
