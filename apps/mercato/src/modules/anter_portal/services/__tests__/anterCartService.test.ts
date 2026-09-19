import { createAnterCartService } from '../anterCartService'
import { AnterCart, AnterCartLine } from '../../data/entities'
import {
  CatalogProduct,
  CatalogProductVariant,
  CatalogProductCategoryAssignment,
} from '@open-mercato/core/modules/catalog/data/entities'
import { AnterStockItem } from '../../../anter_orders/data/entities'

const scope = { organizationId: 'org-1', tenantId: 'tenant-1' }
const principal = { customerEntityId: 'customer-1', customerUserId: 'user-1' }

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/anter_portal/cart', { headers })
}

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'product-1',
    title: 'Gate opener',
    sku: 'GATE-1',
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

  const em = {
    findOne: jest.fn(async (Entity: unknown) => findOneByEntity.get(Entity) ?? null),
    find: jest.fn(async (Entity: unknown) => findByEntity.get(Entity) ?? []),
    create: jest.fn((Entity: new () => unknown, data: Record<string, unknown>) => {
      const instance = new Entity()
      Object.assign(instance as object, data)
      return instance
    }),
    remove: jest.fn(),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
  }
  return em as unknown as import('@mikro-orm/postgresql').EntityManager
}

const noDiscountTerms = {
  getByCustomerEntityId: jest.fn(async () => null),
}

function pricingService(result: {
  listUnitPriceNet: number | null
  partnerUnitPriceNet: number | null
  discountRate: number
}) {
  return {
    resolvePartnerPrice: jest.fn(async () => ({
      listRow: null,
      priceListCode: null,
      ...result,
    })),
  }
}

describe('anterCartService', () => {
  it('creates a fresh active cart when none exists and returns it empty', async () => {
    const em = makeEm({ findByEntity: new Map([[AnterCartLine, []]]) })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: null, partnerUnitPriceNet: null, discountRate: 0 }) as never,
    })

    const cart = await service.getCart(scope, principal)

    expect(cart.status).toBe('active')
    expect(cart.lines).toEqual([])
    expect((em.create as jest.Mock)).toHaveBeenCalledWith(AnterCart, expect.objectContaining({
      customerEntityId: principal.customerEntityId,
      customerUserId: principal.customerUserId,
    }))
  })

  it('rejects adding a quote_only item (CC-5)', async () => {
    const product = makeProduct({ isQuoteOnly: true })
    const em = makeEm({ findOneByEntity: new Map([[CatalogProduct, product]]) })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: null, partnerUnitPriceNet: null, discountRate: 0 }) as never,
    })

    await expect(service.addLine(scope, principal, { productId: product.id, productVariantId: null, quantity: 1 }, makeRequest()))
      .rejects.toMatchObject({ status: 422, body: { error: 'quote_only' } })
  })

  it('rejects adding more than the available stock (D13)', async () => {
    const product = makeProduct()
    const stockItem = { onHand: 2, expectedRestockAt: null } as AnterStockItem
    const em = makeEm({
      findOneByEntity: new Map<unknown, unknown>([
        [CatalogProduct, product],
        [AnterStockItem, stockItem],
      ]),
    })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: 100, partnerUnitPriceNet: 100, discountRate: 0 }) as never,
    })

    await expect(service.addLine(scope, principal, { productId: product.id, productVariantId: null, quantity: 5 }, makeRequest()))
      .rejects.toMatchObject({ status: 409, body: { error: 'out_of_stock' } })
  })

  it('merges an add-to-cart of the same product/variant into the existing line, re-pricing at the new quantity', async () => {
    const product = makeProduct()
    const stockItem = { onHand: 100, expectedRestockAt: null } as AnterStockItem
    const existingLine = {
      id: 'line-1',
      cartId: 'cart-1',
      productId: product.id,
      productVariantId: null,
      quantity: '3',
      listUnitPriceNet: '90.0000',
      partnerUnitPriceNet: '90.0000',
      discountRate: '0',
      currencyCode: 'PLN',
    } as AnterCartLine
    const cart = { id: 'cart-1', status: 'active', currencyCode: 'PLN', updatedAt: new Date('2026-01-01T00:00:00.000Z') } as AnterCart
    const cartUpdatedAtBefore = cart.updatedAt

    const em = makeEm({
      findOneByEntity: new Map<unknown, unknown>([
        [CatalogProduct, product],
        [AnterStockItem, stockItem],
        [AnterCart, cart],
        [AnterCartLine, existingLine],
      ]),
      findByEntity: new Map([[AnterCartLine, [existingLine]]]),
    })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: 100, partnerUnitPriceNet: 80, discountRate: 0.2 }) as never,
    })

    const result = await service.addLine(scope, principal, { productId: product.id, productVariantId: null, quantity: 2 }, makeRequest())

    expect(existingLine.quantity).toBe('5')
    expect(existingLine.partnerUnitPriceNet).toBe('80')
    expect(existingLine.discountRate).toBe('0.2')
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].quantity).toBe(5)
    expect((em.create as jest.Mock)).not.toHaveBeenCalledWith(AnterCartLine, expect.anything())
    // The cart aggregate root's version must advance on every line mutation
    // (it isn't otherwise dirtied), or a stale-version guard could never fire.
    expect(cart.updatedAt.getTime()).toBeGreaterThan(cartUpdatedAtBefore.getTime())
  })

  it('rejects addLine with a stale expected-updated-at header (optimistic lock)', async () => {
    const product = makeProduct()
    const cart = { id: 'cart-1', status: 'active', currencyCode: 'PLN', updatedAt: new Date('2026-01-01T00:00:00.000Z') } as AnterCart
    const em = makeEm({
      findOneByEntity: new Map<unknown, unknown>([
        [CatalogProduct, product],
        [AnterCart, cart],
      ]),
      findByEntity: new Map([[AnterCartLine, []]]),
    })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: 100, partnerUnitPriceNet: 100, discountRate: 0 }) as never,
    })
    const staleRequest = makeRequest({ 'x-om-ext-optimistic-lock-expected-updated-at': new Date('2025-01-01T00:00:00.000Z').toISOString() })

    await expect(service.addLine(scope, principal, { productId: product.id, productVariantId: null, quantity: 1 }, staleRequest))
      .rejects.toMatchObject({ status: 409, body: { code: 'optimistic_lock_conflict' } })
  })

  it('updateLine rejects an unowned/missing line with 404', async () => {
    const cart = { id: 'cart-1', status: 'active', currencyCode: 'PLN', updatedAt: new Date() } as AnterCart
    const em = makeEm({ findOneByEntity: new Map<unknown, unknown>([[AnterCart, cart], [AnterCartLine, null]]) })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: 100, partnerUnitPriceNet: 100, discountRate: 0 }) as never,
    })

    await expect(service.updateLine(scope, principal, 'missing-line', { quantity: 1 }, makeRequest()))
      .rejects.toMatchObject({ status: 404 })
  })

  it('removeLine deletes the owned line and bumps the cart version', async () => {
    const cart = { id: 'cart-1', status: 'active', currencyCode: 'PLN', updatedAt: new Date('2026-01-01T00:00:00.000Z') } as AnterCart
    const cartUpdatedAtBefore = cart.updatedAt
    const line = { id: 'line-1', cartId: 'cart-1' } as AnterCartLine
    const em = makeEm({
      findOneByEntity: new Map<unknown, unknown>([[AnterCart, cart], [AnterCartLine, line]]),
      findByEntity: new Map([[AnterCartLine, []]]),
    })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: 100, partnerUnitPriceNet: 100, discountRate: 0 }) as never,
    })

    await service.removeLine(scope, principal, 'line-1', makeRequest())

    expect(em.remove).toHaveBeenCalledWith(line)
    expect(cart.updatedAt.getTime()).toBeGreaterThan(cartUpdatedAtBefore.getTime())
  })

  it('updateHeader stores a blank partner reference and notes as null, never an empty string (§3.11)', async () => {
    const cart = { id: 'cart-1', status: 'active', currencyCode: 'PLN', updatedAt: new Date() } as AnterCart
    const em = makeEm({
      findOneByEntity: new Map<unknown, unknown>([[AnterCart, cart]]),
      findByEntity: new Map([[AnterCartLine, []]]),
    })
    const service = createAnterCartService({
      em,
      anterPartnerTermsService: noDiscountTerms as never,
      anterPartnerPricingService: pricingService({ listUnitPriceNet: null, partnerUnitPriceNet: null, discountRate: 0 }) as never,
    })

    await service.updateHeader(scope, principal, { partnerReference: '', notes: '', deliveryMode: 'self_collection' }, makeRequest())

    expect(cart.partnerReference).toBeNull()
    expect(cart.notes).toBeNull()
    expect(cart.deliveryMode).toBe('self_collection')
  })
})
