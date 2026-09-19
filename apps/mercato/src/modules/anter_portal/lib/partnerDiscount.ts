import type { EntityManager } from '@mikro-orm/postgresql'
import { AnterPartnerGroupDiscount } from '../../anter_orders/data/entities'
import type { AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'

export type PartnerDiscountScope = { organizationId: string; tenantId: string; customerId?: string | null }

export type PartnerDiscountLookup = { discountRateFor(productId: string): number }

/**
 * Batch discount-rate resolution (spec §3.4 resolution order: group discount
 * → `defaultDiscountRate` → 0), shared by the catalogue listing and checkout
 * re-pricing so "the same rule applies to placement" (§Performance) means the
 * same code, not just the same shape of code.
 */
export async function loadPartnerDiscountLookup(
  em: EntityManager,
  anterPartnerTermsService: AnterPartnerTermsService,
  scope: PartnerDiscountScope,
  categoryIdsByProduct: Map<string, string[]>,
): Promise<PartnerDiscountLookup | null> {
  if (!scope.customerId) return null
  const terms = await anterPartnerTermsService.getByCustomerEntityId(scope.customerId, scope)
  if (!terms || terms.isBlocked) return null

  const allCategoryIds = Array.from(new Set(Array.from(categoryIdsByProduct.values()).flat()))
  const groupRates = new Map<string, number>()
  if (allCategoryIds.length) {
    const rows = await em.find(AnterPartnerGroupDiscount, {
      partnerTermsId: terms.id,
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      deletedAt: null,
      categoryId: { $in: allCategoryIds },
    })
    for (const row of rows) {
      if (!row.categoryId) continue
      const rate = Number(row.discountRate)
      const existing = groupRates.get(row.categoryId)
      if (existing === undefined || rate > existing) groupRates.set(row.categoryId, rate)
    }
  }

  return {
    discountRateFor(productId: string) {
      const categoryIds = categoryIdsByProduct.get(productId) ?? []
      let best: number | null = null
      for (const categoryId of categoryIds) {
        const rate = groupRates.get(categoryId)
        if (rate !== undefined && (best === null || rate > best)) best = rate
      }
      return best ?? Number(terms.defaultDiscountRate) ?? 0
    },
  }
}

export default loadPartnerDiscountLookup
