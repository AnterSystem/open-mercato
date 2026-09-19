import type { EntityManager } from '@mikro-orm/postgresql'
import type { CatalogPricingService } from '@open-mercato/core/modules/catalog/services/catalogPricingService'
import {
  CatalogProduct,
  CatalogProductCategoryAssignment,
  CatalogProductPrice,
  CatalogProductVariant,
} from '@open-mercato/core/modules/catalog/data/entities'
import type { PriceRow, PricingContext } from '@open-mercato/core/modules/catalog/lib/pricing'
import { AnterStockItem } from '../../anter_orders/data/entities'
import type { AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'
import { loadPartnerDiscountLookup } from '../lib/partnerDiscount'

export const DEFAULT_CATALOG_CURRENCY = 'PLN'

export type CatalogScope = {
  organizationId: string
  tenantId: string
  customerId?: string | null
}

export type CatalogListInput = {
  page: number
  pageSize: number
  categoryId?: string | null
  q?: string | null
}

export type CatalogAvailability =
  | { status: 'in_stock' }
  | { status: 'expected'; expectedRestockAt: string | null }
  | { status: 'quote_only' }

export type CatalogListItem = {
  productId: string
  title: string
  sku: string | null
  currencyCode: string
  listUnitPriceNet: number | null
  partnerUnitPriceNet: number | null
  discountRate: number | null
  availability: CatalogAvailability
}

export type CatalogListResult = {
  items: CatalogListItem[]
  total: number
  page: number
  pageSize: number
}

export type CatalogVariantItem = CatalogListItem & {
  variantId: string
  variantName: string | null
}

export type CatalogProductDetail = {
  productId: string
  title: string
  description: string | null
  sku: string | null
  variants: CatalogVariantItem[]
}

function availabilityFor(onHand: number | undefined, expectedRestockAt: Date | null | undefined, quoteOnly: boolean, hasListPrice: boolean): CatalogAvailability {
  if (quoteOnly || !hasListPrice) return { status: 'quote_only' }
  if ((onHand ?? 0) > 0) return { status: 'in_stock' }
  return { status: 'expected', expectedRestockAt: expectedRestockAt ? expectedRestockAt.toISOString() : null }
}

/**
 * Anter catalogue service (spec §Step 8 / Implementation Plan step 8).
 *
 * Resolves the base list price for every product/variant on a page through
 * `catalogPricingService.resolvePriceMany` (`resolveCatalogPriceBatch`) in a
 * single call — never per-row — then applies the partner discount locally
 * using the terms/group-discount data already loaded in bulk. Calling the
 * customer-keyed pricing resolver once per row would re-query
 * `anter_partner_terms` for every item on the page (the resolver in
 * `anter_orders/lib/pricingResolver.ts` is designed for single-price lookups,
 * e.g. checkout re-pricing, not paged listings), which is exactly the N+1
 * this service avoids.
 */
export function createAnterCatalogService(deps: {
  em: EntityManager
  catalogPricingService: CatalogPricingService
  anterPartnerTermsService: AnterPartnerTermsService
}) {
  const { em, catalogPricingService, anterPartnerTermsService } = deps

  const loadPartnerDiscount = (scope: CatalogScope, categoryIdsByProduct: Map<string, string[]>) =>
    loadPartnerDiscountLookup(em, anterPartnerTermsService, scope, categoryIdsByProduct)

  async function listCatalog(scope: CatalogScope, input: CatalogListInput): Promise<CatalogListResult> {
    const page = Math.max(1, input.page)
    const pageSize = Math.min(100, Math.max(1, input.pageSize))

    const where: Record<string, unknown> = {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      deletedAt: null,
      isActive: true,
    }
    if (input.q && input.q.trim()) {
      where.title = { $ilike: `%${input.q.trim()}%` }
    }

    let productIdFilter: string[] | null = null
    if (input.categoryId) {
      const assignments = await em.find(CatalogProductCategoryAssignment, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        category: input.categoryId,
      })
      productIdFilter = assignments.map((a) => (typeof a.product === 'string' ? a.product : a.product.id))
      if (!productIdFilter.length) {
        return { items: [], total: 0, page, pageSize }
      }
      where.id = { $in: productIdFilter }
    }

    const [products, total] = await em.findAndCount(CatalogProduct, where, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      orderBy: { title: 'asc' },
    })

    if (!products.length) return { items: [], total, page, pageSize }

    const productIds = products.map((p) => p.id)

    const [priceRows, categoryAssignments, stockItems] = await Promise.all([
      em.find(CatalogProductPrice, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        currencyCode: DEFAULT_CATALOG_CURRENCY,
        product: { $in: productIds },
        variant: null,
      }) as unknown as Promise<PriceRow[]>,
      em.find(CatalogProductCategoryAssignment, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        product: { $in: productIds },
      }),
      em.find(AnterStockItem, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        productId: { $in: productIds },
        variantId: null,
        deletedAt: null,
      }),
    ])

    const pricesByProduct = new Map<string, PriceRow[]>()
    for (const row of priceRows) {
      const productId = typeof row.product === 'string' ? row.product : row.product?.id
      if (!productId) continue
      const list = pricesByProduct.get(productId) ?? []
      list.push(row)
      pricesByProduct.set(productId, list)
    }

    const categoryIdsByProduct = new Map<string, string[]>()
    for (const assignment of categoryAssignments) {
      const productId = typeof assignment.product === 'string' ? assignment.product : assignment.product.id
      const categoryId = typeof assignment.category === 'string' ? assignment.category : assignment.category.id
      const list = categoryIdsByProduct.get(productId) ?? []
      list.push(categoryId)
      categoryIdsByProduct.set(productId, list)
    }

    const stockByProduct = new Map<string, AnterStockItem>()
    for (const item of stockItems) stockByProduct.set(item.productId, item)

    const ctx: PricingContext = { quantity: 1, date: new Date() }
    const entries = products.map((product) => ({ rows: pricesByProduct.get(product.id) ?? [], context: ctx }))
    const resolvedListPrices = await catalogPricingService.resolvePriceMany(entries)

    const discountLookup = await loadPartnerDiscount(scope, categoryIdsByProduct)

    const items: CatalogListItem[] = products.map((product, index) => {
      const resolved = resolvedListPrices[index]
      const listUnitPriceNet = resolved?.unitPriceNet != null ? Number(resolved.unitPriceNet) : null
      const hasListPrice = listUnitPriceNet != null && !product.isQuoteOnly
      const stock = stockByProduct.get(product.id)

      if (!hasListPrice) {
        return {
          productId: product.id,
          title: product.title,
          sku: product.sku ?? null,
          currencyCode: DEFAULT_CATALOG_CURRENCY,
          listUnitPriceNet: null,
          partnerUnitPriceNet: null,
          discountRate: null,
          availability: availabilityFor(stock?.onHand, stock?.expectedRestockAt, true, false),
        }
      }

      const discountRate = discountLookup ? discountLookup.discountRateFor(product.id) : 0
      const partnerUnitPriceNet = Math.round(listUnitPriceNet * (1 - discountRate) * 10000) / 10000

      return {
        productId: product.id,
        title: product.title,
        sku: product.sku ?? null,
        currencyCode: DEFAULT_CATALOG_CURRENCY,
        listUnitPriceNet,
        partnerUnitPriceNet,
        discountRate,
        availability: availabilityFor(stock?.onHand, stock?.expectedRestockAt, false, true),
      }
    })

    return { items, total, page, pageSize }
  }

  async function getCatalogProduct(scope: CatalogScope, productId: string): Promise<CatalogProductDetail | null> {
    const product = await em.findOne(CatalogProduct, {
      id: productId,
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      deletedAt: null,
    })
    if (!product) return null

    const variants = await em.find(CatalogProductVariant, {
      product: productId,
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      deletedAt: null,
      isActive: true,
    })

    const variantIds = variants.map((v) => v.id)
    const [productPriceRows, variantPriceRows, categoryAssignments, stockItems] = await Promise.all([
      em.find(CatalogProductPrice, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        currencyCode: DEFAULT_CATALOG_CURRENCY,
        product: productId,
        variant: null,
      }) as unknown as Promise<PriceRow[]>,
      variantIds.length
        ? (em.find(CatalogProductPrice, {
            organizationId: scope.organizationId,
            tenantId: scope.tenantId,
            currencyCode: DEFAULT_CATALOG_CURRENCY,
            variant: { $in: variantIds },
          }) as unknown as Promise<PriceRow[]>)
        : Promise.resolve([] as PriceRow[]),
      em.find(CatalogProductCategoryAssignment, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        product: productId,
      }),
      em.find(AnterStockItem, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        productId,
        deletedAt: null,
      }),
    ])

    const categoryIds = categoryAssignments.map((a) => (typeof a.category === 'string' ? a.category : a.category.id))
    const categoryIdsByProduct = new Map<string, string[]>([[productId, categoryIds]])
    const discountLookup = await loadPartnerDiscount(scope, categoryIdsByProduct)

    const stockByVariant = new Map<string, AnterStockItem>()
    let productLevelStock: AnterStockItem | undefined
    for (const item of stockItems) {
      if (item.variantId) stockByVariant.set(item.variantId, item)
      else productLevelStock = item
    }

    const rowsForVariant = (variantId: string) => variantPriceRows.filter((row) => {
      const rowVariantId = typeof row.variant === 'string' ? row.variant : row.variant?.id
      return rowVariantId === variantId
    })

    const ctx: PricingContext = { quantity: 1, date: new Date() }
    const entries = variants.length
      ? variants.map((variant) => ({ rows: rowsForVariant(variant.id).length ? rowsForVariant(variant.id) : productPriceRows, context: ctx }))
      : [{ rows: productPriceRows, context: ctx }]
    const resolvedPrices = await catalogPricingService.resolvePriceMany(entries)

    const buildItem = (
      resolved: PriceRow | null,
      variantId: string | null,
      variantName: string | null,
      stock: AnterStockItem | undefined,
    ): CatalogVariantItem => {
      const listUnitPriceNet = resolved?.unitPriceNet != null ? Number(resolved.unitPriceNet) : null
      const hasListPrice = listUnitPriceNet != null && !product.isQuoteOnly
      if (!hasListPrice) {
        return {
          productId,
          variantId: variantId ?? productId,
          variantName,
          title: product.title,
          sku: product.sku ?? null,
          currencyCode: DEFAULT_CATALOG_CURRENCY,
          listUnitPriceNet: null,
          partnerUnitPriceNet: null,
          discountRate: null,
          availability: availabilityFor(stock?.onHand, stock?.expectedRestockAt, true, false),
        }
      }
      const discountRate = discountLookup ? discountLookup.discountRateFor(productId) : 0
      const partnerUnitPriceNet = Math.round(listUnitPriceNet * (1 - discountRate) * 10000) / 10000
      return {
        productId,
        variantId: variantId ?? productId,
        variantName,
        title: product.title,
        sku: product.sku ?? null,
        currencyCode: DEFAULT_CATALOG_CURRENCY,
        listUnitPriceNet,
        partnerUnitPriceNet,
        discountRate,
        availability: availabilityFor(stock?.onHand, stock?.expectedRestockAt, false, true),
      }
    }

    const variantItems: CatalogVariantItem[] = variants.length
      ? variants.map((variant, index) => buildItem(resolvedPrices[index] ?? null, variant.id, variant.name ?? null, stockByVariant.get(variant.id) ?? productLevelStock))
      : [buildItem(resolvedPrices[0] ?? null, null, null, productLevelStock)]

    return {
      productId: product.id,
      title: product.title,
      description: product.description ?? null,
      sku: product.sku ?? null,
      variants: variantItems,
    }
  }

  return { listCatalog, getCatalogProduct }
}

export type AnterCatalogService = ReturnType<typeof createAnterCatalogService>

export default createAnterCatalogService
