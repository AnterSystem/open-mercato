import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import {
  CatalogProduct,
  CatalogProductVariant,
  CatalogProductCategoryAssignment,
} from '@open-mercato/core/modules/catalog/data/entities'
import { resolveStockAvailability } from '../../anter_orders/lib/stock'
import type { AnterPartnerPricingService } from '../../anter_orders/services/anterPartnerPricingService'
import type { AnterPartnerTermsRecord, AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'
import { AnterCart, AnterCartLine } from '../data/entities'
import { DEFAULT_CATALOG_CURRENCY } from './anterCatalogService'
import type {
  AnterCartAddLineInput,
  AnterCartUpdateHeaderInput,
  AnterCartUpdateLineInput,
} from '../data/validators'

export type CartScope = { organizationId: string; tenantId: string }
export type CartPrincipal = { customerEntityId: string; customerUserId: string }

export type CartLineView = {
  id: string
  productId: string
  productVariantId: string | null
  sku: string | null
  nameSnapshot: string | null
  variantSnapshot: Record<string, unknown> | null
  quantity: number
  unitCode: string | null
  listUnitPriceNet: number | null
  partnerUnitPriceNet: number | null
  discountRate: number
  currencyCode: string
}

export type CartView = {
  id: string
  status: string
  currencyCode: string
  deliveryMode: string | null
  deliveryAddressId: string | null
  deliveryAddressSnapshot: Record<string, unknown> | null
  partnerReference: string | null
  notes: string | null
  updatedAt: string
  lines: CartLineView[]
}

const CART_RESOURCE_KIND = 'anter_portal.cart'

const NO_TERMS: AnterPartnerTermsRecord = {
  id: '',
  customerEntityId: '',
  defaultDiscountRate: 0,
  priceListCode: null,
  isBlocked: false,
  accountType: 'full',
  accountOwnerUserId: null,
}

function toCartLineView(line: AnterCartLine): CartLineView {
  return {
    id: line.id,
    productId: line.productId,
    productVariantId: line.productVariantId ?? null,
    sku: line.sku ?? null,
    nameSnapshot: line.nameSnapshot ?? null,
    variantSnapshot: line.variantSnapshot ?? null,
    quantity: Number(line.quantity),
    unitCode: line.unitCode ?? null,
    listUnitPriceNet: line.listUnitPriceNet != null ? Number(line.listUnitPriceNet) : null,
    partnerUnitPriceNet: line.partnerUnitPriceNet != null ? Number(line.partnerUnitPriceNet) : null,
    discountRate: Number(line.discountRate),
    currencyCode: line.currencyCode,
  }
}

function toCartView(cart: AnterCart, lines: AnterCartLine[]): CartView {
  return {
    id: cart.id,
    status: cart.status,
    currencyCode: cart.currencyCode,
    deliveryMode: cart.deliveryMode ?? null,
    deliveryAddressId: cart.deliveryAddressId ?? null,
    deliveryAddressSnapshot: cart.deliveryAddressSnapshot ?? null,
    partnerReference: cart.partnerReference ?? null,
    notes: cart.notes ?? null,
    updatedAt: cart.updatedAt.toISOString(),
    lines: lines.map(toCartLineView),
  }
}

async function loadCategoryIds(em: EntityManager, scope: CartScope, productId: string): Promise<string[]> {
  const assignments = await em.find(CatalogProductCategoryAssignment, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    product: productId,
  })
  return assignments.map((assignment) => (typeof assignment.category === 'string' ? assignment.category : assignment.category.id))
}

type LinePricing = {
  product: CatalogProduct
  variant: CatalogProductVariant | null
  sku: string | null
  nameSnapshot: string
  unitCode: string | null
  quoteOnly: boolean
  listUnitPriceNet: number | null
  partnerUnitPriceNet: number | null
  discountRate: number
}

/**
 * Loads the product/variant, resolves the partner-priced snapshot (spec §3.4)
 * and flags the item `quoteOnly` (no list price, or `product.isQuoteOnly`) —
 * the shared decision `POST /cart/lines` (CC-5) and re-pricing on quantity
 * change both consume.
 */
async function resolveLinePricing(
  deps: { em: EntityManager; anterPartnerTermsService: AnterPartnerTermsService; anterPartnerPricingService: AnterPartnerPricingService },
  scope: CartScope,
  principal: CartPrincipal,
  productId: string,
  productVariantId: string | null,
  quantity: number,
): Promise<LinePricing> {
  const { em, anterPartnerTermsService, anterPartnerPricingService } = deps

  const product = await em.findOne(CatalogProduct, {
    id: productId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    deletedAt: null,
  })
  if (!product) {
    throw new CrudHttpError(404, { error: '[internal] anter_portal catalog product not found' })
  }

  let variant: CatalogProductVariant | null = null
  if (productVariantId) {
    variant = await em.findOne(CatalogProductVariant, {
      id: productVariantId,
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      deletedAt: null,
    })
    if (!variant || (typeof variant.product === 'string' ? variant.product : variant.product.id) !== productId) {
      throw new CrudHttpError(404, { error: '[internal] anter_portal catalog variant not found' })
    }
  }

  const categoryIds = await loadCategoryIds(em, scope, productId)
  const terms = await anterPartnerTermsService.getByCustomerEntityId(principal.customerEntityId, scope)

  const resolved = await anterPartnerPricingService.resolvePartnerPrice({
    productId,
    variantId: productVariantId ?? null,
    categoryIds,
    terms: terms ?? { ...NO_TERMS, customerEntityId: principal.customerEntityId },
    quantity,
    currencyCode: DEFAULT_CATALOG_CURRENCY,
    at: new Date(),
    scope,
  })

  const quoteOnly = product.isQuoteOnly === true || resolved.listUnitPriceNet == null

  return {
    product,
    variant,
    sku: variant?.sku ?? product.sku ?? null,
    nameSnapshot: variant?.name ? `${product.title} — ${variant.name}` : product.title,
    unitCode: product.defaultSalesUnit ?? product.defaultUnit ?? null,
    quoteOnly,
    listUnitPriceNet: quoteOnly ? null : resolved.listUnitPriceNet,
    partnerUnitPriceNet: quoteOnly ? null : resolved.partnerUnitPriceNet,
    discountRate: quoteOnly ? 0 : resolved.discountRate,
  }
}

async function assertAvailable(
  em: EntityManager,
  scope: CartScope,
  productId: string,
  variantId: string | null,
  quantity: number,
): Promise<void> {
  const availability = await resolveStockAvailability(em, productId, variantId, scope)
  if (quantity > availability.available) {
    throw new CrudHttpError(409, {
      error: 'out_of_stock',
      available: availability.available,
      expectedRestockAt: availability.expectedRestockAt ? availability.expectedRestockAt.toISOString() : null,
    })
  }
}

async function findActiveCart(em: EntityManager, scope: CartScope, principal: CartPrincipal): Promise<AnterCart | null> {
  // `delivery_address_snapshot` is encrypted at rest (spec Data Model §Sensitive
  // data) — every read goes through `findOneWithDecryption`, never a plain find.
  return findOneWithDecryption(em, AnterCart, {
    customerUserId: principal.customerUserId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    status: 'active',
    deletedAt: null,
  }, undefined, { tenantId: scope.tenantId, organizationId: scope.organizationId })
}

async function getOrCreateActiveCart(em: EntityManager, scope: CartScope, principal: CartPrincipal): Promise<AnterCart> {
  const existing = await findActiveCart(em, scope, principal)
  if (existing) return existing

  let cart!: AnterCart
  await withAtomicFlush(em, [
    () => {
      cart = em.create(AnterCart, {
        id: randomUUID(),
        customerEntityId: principal.customerEntityId,
        customerUserId: principal.customerUserId,
        currencyCode: DEFAULT_CATALOG_CURRENCY,
        status: 'active',
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
      })
    },
  ], { transaction: true, label: 'anter_portal.cart.create' })
  return cart
}

async function findOwnedLine(
  em: EntityManager,
  scope: CartScope,
  cartId: string,
  lineId: string,
): Promise<AnterCartLine> {
  const line = await em.findOne(AnterCartLine, {
    id: lineId,
    cartId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
  })
  if (!line) {
    throw new CrudHttpError(404, { error: '[internal] anter_portal cart line not found' })
  }
  return line
}

export type AnterCartAddLinesLineResult = {
  productId: string
  productVariantId: string | null
  lineId: string
  /** `false` when this line merged quantity into a pre-existing line. */
  wasCreated: boolean
}

export type AnterCartAddLinesResult = {
  cartView: CartView
  cartId: string
  lines: AnterCartAddLinesLineResult[]
}

export type AnterCartService = {
  getCart(scope: CartScope, principal: CartPrincipal): Promise<CartView>
  addLine(scope: CartScope, principal: CartPrincipal, input: AnterCartAddLineInput, request: Request): Promise<CartView>
  addLines(
    scope: CartScope,
    principal: CartPrincipal,
    lines: Array<{ productId: string; productVariantId: string | null; quantity: number }>,
    request: Request,
  ): Promise<AnterCartAddLinesResult>
  updateLine(scope: CartScope, principal: CartPrincipal, lineId: string, input: AnterCartUpdateLineInput, request: Request): Promise<CartView>
  removeLine(scope: CartScope, principal: CartPrincipal, lineId: string, request: Request): Promise<CartView>
  updateHeader(scope: CartScope, principal: CartPrincipal, input: AnterCartUpdateHeaderInput, request: Request): Promise<CartView>
}

/**
 * `anter_portal`'s cart (spec Implementation Plan steps 7/10). Every mutation
 * re-prices through the same `anterPartnerPricingService` the checkout flow
 * re-prices with (§3.4), and rejects `quote_only` items and over-available
 * quantities (D13) at the point they would enter the cart — never silently
 * clamping a quantity or a price.
 */
export function createAnterCartService(deps: {
  em: EntityManager
  anterPartnerTermsService: AnterPartnerTermsService
  anterPartnerPricingService: AnterPartnerPricingService
}): AnterCartService {
  const { em } = deps

  async function loadLines(scope: CartScope, cartId: string): Promise<AnterCartLine[]> {
    return em.find(AnterCartLine, {
      cartId,
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
    }, { orderBy: { createdAt: 'asc' } })
  }

  async function viewCart(scope: CartScope, cart: AnterCart): Promise<CartView> {
    const lines = await loadLines(scope, cart.id)
    return toCartView(cart, lines)
  }

  return {
    async getCart(scope, principal) {
      const cart = await getOrCreateActiveCart(em, scope, principal)
      return viewCart(scope, cart)
    },

    async addLine(scope, principal, input, request) {
      const cart = await getOrCreateActiveCart(em, scope, principal)
      enforceCommandOptimisticLock({ resourceKind: CART_RESOURCE_KIND, resourceId: cart.id, current: cart.updatedAt, request })
      const productVariantId = input.productVariantId ?? null

      const pricing = await resolveLinePricing(deps, scope, principal, input.productId, productVariantId, input.quantity)
      if (pricing.quoteOnly) {
        throw new CrudHttpError(422, { error: 'quote_only' })
      }

      const existing = await em.findOne(AnterCartLine, {
        cartId: cart.id,
        productId: input.productId,
        productVariantId,
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
      })
      const nextQuantity = (existing ? Number(existing.quantity) : 0) + input.quantity
      await assertAvailable(em, scope, input.productId, productVariantId, nextQuantity)

      await withAtomicFlush(em, [
        () => {
          if (existing) {
            existing.quantity = String(nextQuantity)
            existing.listUnitPriceNet = pricing.listUnitPriceNet != null ? String(pricing.listUnitPriceNet) : null
            existing.partnerUnitPriceNet = pricing.partnerUnitPriceNet != null ? String(pricing.partnerUnitPriceNet) : null
            existing.discountRate = String(pricing.discountRate)
            existing.priceResolvedAt = new Date()
          } else {
            em.create(AnterCartLine, {
              id: randomUUID(),
              cartId: cart.id,
              productId: input.productId,
              productVariantId,
              sku: pricing.sku,
              nameSnapshot: pricing.nameSnapshot,
              variantSnapshot: null,
              quantity: String(input.quantity),
              unitCode: pricing.unitCode,
              listUnitPriceNet: pricing.listUnitPriceNet != null ? String(pricing.listUnitPriceNet) : null,
              partnerUnitPriceNet: pricing.partnerUnitPriceNet != null ? String(pricing.partnerUnitPriceNet) : null,
              discountRate: String(pricing.discountRate),
              currencyCode: DEFAULT_CATALOG_CURRENCY,
              priceResolvedAt: new Date(),
              organizationId: scope.organizationId,
              tenantId: scope.tenantId,
            })
          }
          // The cart aggregate root isn't otherwise dirtied by a line write,
          // so its `updated_at` (the optimistic-lock version) must be bumped
          // explicitly — mirrors sales' documents.ts line-mutation commands.
          cart.updatedAt = new Date()
        },
      ], { transaction: true, label: 'anter_portal.cart.addLine' })

      return viewCart(scope, cart)
    },

    /**
     * Bulk add (spec X13, called by `anter_configurator.revision.compute_bom`
     * → `add-to-cart`): resolves pricing and availability for EVERY line
     * before writing any of them, so a mid-batch failure never leaves a
     * half-filled cart. Quantity merges into a pre-existing line exactly as
     * `addLine` does, one product/variant at a time.
     */
    async addLines(scope, principal, lines, request) {
      const cart = await getOrCreateActiveCart(em, scope, principal)
      enforceCommandOptimisticLock({ resourceKind: CART_RESOURCE_KIND, resourceId: cart.id, current: cart.updatedAt, request })

      const prepared: Array<{
        productId: string
        productVariantId: string | null
        quantity: number
        pricing: LinePricing
        existing: AnterCartLine | null
        nextQuantity: number
      }> = []

      for (const line of lines) {
        const productVariantId = line.productVariantId ?? null
        const pricing = await resolveLinePricing(deps, scope, principal, line.productId, productVariantId, line.quantity)
        if (pricing.quoteOnly) {
          throw new CrudHttpError(422, { error: 'quote_only', productId: line.productId })
        }
        const existing = await em.findOne(AnterCartLine, {
          cartId: cart.id,
          productId: line.productId,
          productVariantId,
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
        })
        const nextQuantity = (existing ? Number(existing.quantity) : 0) + line.quantity
        await assertAvailable(em, scope, line.productId, productVariantId, nextQuantity)
        prepared.push({ productId: line.productId, productVariantId, quantity: line.quantity, pricing, existing, nextQuantity })
      }

      const results: AnterCartAddLinesLineResult[] = []

      await withAtomicFlush(em, [
        () => {
          for (const item of prepared) {
            if (item.existing) {
              item.existing.quantity = String(item.nextQuantity)
              item.existing.listUnitPriceNet = item.pricing.listUnitPriceNet != null ? String(item.pricing.listUnitPriceNet) : null
              item.existing.partnerUnitPriceNet = item.pricing.partnerUnitPriceNet != null ? String(item.pricing.partnerUnitPriceNet) : null
              item.existing.discountRate = String(item.pricing.discountRate)
              item.existing.priceResolvedAt = new Date()
              results.push({ productId: item.productId, productVariantId: item.productVariantId, lineId: item.existing.id, wasCreated: false })
            } else {
              const created = em.create(AnterCartLine, {
                id: randomUUID(),
                cartId: cart.id,
                productId: item.productId,
                productVariantId: item.productVariantId,
                sku: item.pricing.sku,
                nameSnapshot: item.pricing.nameSnapshot,
                variantSnapshot: null,
                quantity: String(item.quantity),
                unitCode: item.pricing.unitCode,
                listUnitPriceNet: item.pricing.listUnitPriceNet != null ? String(item.pricing.listUnitPriceNet) : null,
                partnerUnitPriceNet: item.pricing.partnerUnitPriceNet != null ? String(item.pricing.partnerUnitPriceNet) : null,
                discountRate: String(item.pricing.discountRate),
                currencyCode: DEFAULT_CATALOG_CURRENCY,
                priceResolvedAt: new Date(),
                organizationId: scope.organizationId,
                tenantId: scope.tenantId,
              })
              results.push({ productId: item.productId, productVariantId: item.productVariantId, lineId: created.id, wasCreated: true })
            }
          }
          cart.updatedAt = new Date()
        },
      ], { transaction: true, label: 'anter_portal.cart.addLines' })

      return { cartView: await viewCart(scope, cart), cartId: cart.id, lines: results }
    },

    async updateLine(scope, principal, lineId, input, request) {
      const cart = await getOrCreateActiveCart(em, scope, principal)
      enforceCommandOptimisticLock({ resourceKind: CART_RESOURCE_KIND, resourceId: cart.id, current: cart.updatedAt, request })
      const line = await findOwnedLine(em, scope, cart.id, lineId)

      const pricing = await resolveLinePricing(deps, scope, principal, line.productId, line.productVariantId ?? null, input.quantity)
      if (pricing.quoteOnly) {
        throw new CrudHttpError(422, { error: 'quote_only' })
      }
      await assertAvailable(em, scope, line.productId, line.productVariantId ?? null, input.quantity)

      await withAtomicFlush(em, [
        () => {
          line.quantity = String(input.quantity)
          line.listUnitPriceNet = pricing.listUnitPriceNet != null ? String(pricing.listUnitPriceNet) : null
          line.partnerUnitPriceNet = pricing.partnerUnitPriceNet != null ? String(pricing.partnerUnitPriceNet) : null
          line.discountRate = String(pricing.discountRate)
          line.priceResolvedAt = new Date()
          cart.updatedAt = new Date()
        },
      ], { transaction: true, label: 'anter_portal.cart.updateLine' })

      return viewCart(scope, cart)
    },

    async removeLine(scope, principal, lineId, request) {
      const cart = await getOrCreateActiveCart(em, scope, principal)
      enforceCommandOptimisticLock({ resourceKind: CART_RESOURCE_KIND, resourceId: cart.id, current: cart.updatedAt, request })
      const line = await findOwnedLine(em, scope, cart.id, lineId)

      await withAtomicFlush(em, [
        () => {
          em.remove(line)
          cart.updatedAt = new Date()
        },
      ], { transaction: true, label: 'anter_portal.cart.removeLine' })

      return viewCart(scope, cart)
    },

    async updateHeader(scope, principal, input, request) {
      const cart = await getOrCreateActiveCart(em, scope, principal)
      enforceCommandOptimisticLock({ resourceKind: CART_RESOURCE_KIND, resourceId: cart.id, current: cart.updatedAt, request })

      await withAtomicFlush(em, [
        () => {
          if (input.deliveryMode !== undefined) cart.deliveryMode = input.deliveryMode
          if (input.deliveryAddressId !== undefined) cart.deliveryAddressId = input.deliveryAddressId ?? null
          if (input.deliveryAddressSnapshot !== undefined) cart.deliveryAddressSnapshot = input.deliveryAddressSnapshot ?? null
          if (input.notes !== undefined) cart.notes = input.notes?.length ? input.notes : null
          // A-19 (D12): absent means absent — a blank reference stores null, never an empty string.
          if (input.partnerReference !== undefined) cart.partnerReference = input.partnerReference?.length ? input.partnerReference : null
        },
      ], { transaction: true, label: 'anter_portal.cart.updateHeader' })

      return viewCart(scope, cart)
    },
  }
}

export default createAnterCartService
