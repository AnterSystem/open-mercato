import type { EntityManager } from '@mikro-orm/postgresql'
import { selectBestPrice, type PriceRow, type PricingContext } from '@open-mercato/core/modules/catalog/lib/pricing'
import { CatalogProductPrice } from '@open-mercato/core/modules/catalog/data/entities'
import { AnterPartnerGroupDiscount } from '../data/entities'
import type { AnterPartnerTermsRecord, AnterPartnerTermsScope } from './anterPartnerTermsService'

export type ResolvePartnerPriceInput = {
  productId: string
  variantId: string | null
  categoryIds?: string[]
  terms: AnterPartnerTermsRecord
  quantity: number
  currencyCode: string
  at: Date
  scope: AnterPartnerTermsScope
}

export type ResolvePartnerPriceResult = {
  listRow: PriceRow | null
  listUnitPriceNet: number | null
  discountRate: number
  partnerUnitPriceNet: number | null
  priceListCode: string | null
}

export type AnterPartnerPricingService = {
  resolvePartnerPrice(input: ResolvePartnerPriceInput): Promise<ResolvePartnerPriceResult>
}

async function resolveGroupDiscountRate(
  em: EntityManager,
  partnerTermsId: string,
  categoryIds: string[],
  scope: AnterPartnerTermsScope,
): Promise<number | null> {
  if (!categoryIds.length) return null
  const rows = await em.find(AnterPartnerGroupDiscount, {
    partnerTermsId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    deletedAt: null,
    categoryId: { $in: categoryIds },
  })
  if (!rows.length) return null
  return rows.reduce((max, row) => Math.max(max, Number(row.discountRate)), 0)
}

/**
 * Resolves the partner (Anter distributor) unit price for a product/variant.
 *
 * Discount precedence per spec §3.4: category-scoped group discount, then the
 * partner's default discount rate, then no discount (0). Never mutates or
 * persists a discounted price row — the result is synthesized for the caller.
 */
export function createAnterPartnerPricingService(deps: { em: EntityManager }): AnterPartnerPricingService {
  const { em } = deps
  return {
    async resolvePartnerPrice(input) {
      const { productId, variantId, categoryIds = [], terms, quantity, currencyCode, at, scope } = input

      const priceRows = (await em.find(
        CatalogProductPrice,
        {
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
          currencyCode,
          $or: [
            { product: productId, variant: null },
            ...(variantId ? [{ product: productId, variant: variantId }] : []),
          ],
        },
      )) as unknown as PriceRow[]

      const ctx: PricingContext = { quantity, date: at }
      const listRow = selectBestPrice(priceRows, ctx)
      const listUnitPriceNet = listRow?.unitPriceNet != null ? Number(listRow.unitPriceNet) : null

      const groupRate = await resolveGroupDiscountRate(em, terms.id, categoryIds, scope)
      const discountRate = groupRate ?? terms.defaultDiscountRate ?? 0

      const partnerUnitPriceNet = listUnitPriceNet != null
        ? Math.round(listUnitPriceNet * (1 - discountRate) * 10000) / 10000
        : null

      return {
        listRow: listRow ?? null,
        listUnitPriceNet,
        discountRate,
        partnerUnitPriceNet,
        priceListCode: terms.priceListCode ?? null,
      }
    },
  }
}

export default createAnterPartnerPricingService
