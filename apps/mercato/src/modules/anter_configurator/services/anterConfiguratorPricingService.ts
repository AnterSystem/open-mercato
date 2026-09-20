import type { EntityManager } from '@mikro-orm/postgresql'
import { CatalogProductPrice, CatalogProductCategoryAssignment } from '@open-mercato/core/modules/catalog/data/entities'
import { selectBestPrice, type PriceRow, type PricingContext } from '@open-mercato/core/modules/catalog/lib/pricing'
import { AnterPartnerGroupDiscount } from '../../anter_orders/data/entities'
import type { AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'

export type AnterBomPricingScope = { organizationId: string; tenantId: string }

export type AnterBomPriceLineInput = { productId: string }

export type AnterBomPriceResult = {
  listUnitPriceNet: number | null
  partnerUnitPriceNet: number | null
  discountRate: number
  /** `to_quote` when no list price resolves for this product at all (§3.6, C14). */
  priceState: 'priced' | 'to_quote'
}

export type AnterConfiguratorPricingService = {
  resolveBomLinePrices(input: {
    lines: AnterBomPriceLineInput[]
    /** `null` in internal mode without a bound partner — list price only, no discount. */
    customerEntityId: string | null
    currencyCode: string
    scope: AnterBomPricingScope
  }): Promise<Map<string, AnterBomPriceResult>>
}

/**
 * Batch-prices every BOM line for one revision recompute in a fixed, small
 * number of queries regardless of line count (spec §3.5 step 7, §Test
 * coverage "one `resolveCatalogPriceBatch` per revision, asserted by query
 * count") — mirrors `anter_portal/lib/partnerDiscount.ts`'s discount
 * resolution (group discount → `defaultDiscountRate` → 0) exactly, using the
 * same `AnterPartnerGroupDiscount` table so the two modules cannot disagree
 * about a partner's rate for the same category.
 */
export function createAnterConfiguratorPricingService(deps: {
  em: EntityManager
  anterPartnerTermsService: AnterPartnerTermsService
}): AnterConfiguratorPricingService {
  const { em, anterPartnerTermsService } = deps

  return {
    async resolveBomLinePrices({ lines, customerEntityId, currencyCode, scope }) {
      const results = new Map<string, AnterBomPriceResult>()
      if (!lines.length) return results

      const productIds = [...new Set(lines.map((line) => line.productId))]

      const terms = customerEntityId
        ? await anterPartnerTermsService.getByCustomerEntityId(customerEntityId, scope)
        : null

      const [priceRows, categoryAssignments] = await Promise.all([
        em.find(CatalogProductPrice, {
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
          currencyCode,
          product: { $in: productIds },
        }) as unknown as Promise<PriceRow[]>,
        terms
          ? em.find(CatalogProductCategoryAssignment, {
              organizationId: scope.organizationId,
              tenantId: scope.tenantId,
              product: { $in: productIds },
            })
          : Promise.resolve([]),
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

      const groupRates = new Map<string, number>()
      if (terms) {
        const allCategoryIds = [...new Set([...categoryIdsByProduct.values()].flat())]
        if (allCategoryIds.length) {
          const groupDiscountRows = await em.find(AnterPartnerGroupDiscount, {
            partnerTermsId: terms.id,
            organizationId: scope.organizationId,
            tenantId: scope.tenantId,
            deletedAt: null,
            categoryId: { $in: allCategoryIds },
          })
          for (const row of groupDiscountRows) {
            if (!row.categoryId) continue
            const rate = Number(row.discountRate)
            const existing = groupRates.get(row.categoryId)
            if (existing === undefined || rate > existing) groupRates.set(row.categoryId, rate)
          }
        }
      }

      const discountRateFor = (productId: string): number => {
        if (!terms) return 0
        const categoryIds = categoryIdsByProduct.get(productId) ?? []
        let best: number | null = null
        for (const categoryId of categoryIds) {
          const rate = groupRates.get(categoryId)
          if (rate !== undefined && (best === null || rate > best)) best = rate
        }
        return best ?? Number(terms.defaultDiscountRate) ?? 0
      }

      const ctx: PricingContext = { quantity: 1, date: new Date() }
      for (const productId of productIds) {
        const rows = pricesByProduct.get(productId) ?? []
        const best = selectBestPrice(rows, ctx)
        const listUnitPriceNet = best?.unitPriceNet != null ? Number(best.unitPriceNet) : null

        if (listUnitPriceNet == null) {
          results.set(productId, { listUnitPriceNet: null, partnerUnitPriceNet: null, discountRate: 0, priceState: 'to_quote' })
          continue
        }

        const discountRate = discountRateFor(productId)
        const partnerUnitPriceNet = Math.round(listUnitPriceNet * (1 - discountRate) * 10000) / 10000
        results.set(productId, { listUnitPriceNet, partnerUnitPriceNet, discountRate, priceState: 'priced' })
      }

      return results
    },
  }
}

export default createAnterConfiguratorPricingService
