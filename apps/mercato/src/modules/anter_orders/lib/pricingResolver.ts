import { RequestContext, type EntityManager } from '@mikro-orm/postgresql'
import {
  registerCatalogPricingResolver,
  selectBestPrice,
  type PriceRow,
  type PricingContext,
} from '@open-mercato/core/modules/catalog/lib/pricing'
import { AnterPartnerTerms } from '../data/entities'

/**
 * Anter partner pricing resolver, registered against the shared catalog
 * pricing pipeline (spec §3.4).
 *
 * `PricingContext` carries `customerId` but no tenant/organization scope, so
 * this resolver cannot filter `AnterPartnerTerms` by org/tenant the way every
 * other query in this module does. It relies instead on `customerEntityId`
 * being a globally unique identifier that already belongs to exactly one
 * tenant (customer entities are tenant-scoped 1:1) — a lookup keyed only by
 * that id cannot return another tenant's row. This is a known limitation of
 * the upstream `catalog/lib/pricing.ts` resolver contract, not a relaxation
 * introduced here.
 *
 * Gating (fall-through to core catalog pricing, never `null`):
 * - No `ctx.customerId` → not a buyer context.
 * - No partner terms for that customer → not an Anter partner.
 * - No matching list price row → nothing to discount.
 */
export async function anterPartnerPricingResolver(rows: PriceRow[], ctx: PricingContext): Promise<PriceRow | null | undefined> {
  if (!ctx.customerId) return undefined

  const em = RequestContext.getEntityManager() as EntityManager | undefined
  if (!em) return undefined

  const terms = await em.findOne(AnterPartnerTerms, {
    customerEntityId: ctx.customerId,
    deletedAt: null,
  })
  if (!terms) return undefined

  const base = selectBestPrice(rows, ctx)
  if (!base || base.unitPriceNet == null) return undefined

  const discountRate = Number(terms.defaultDiscountRate) || 0
  const discountedUnitPriceNet = Math.round(Number(base.unitPriceNet) * (1 - discountRate) * 10000) / 10000

  return {
    ...base,
    unitPriceNet: String(discountedUnitPriceNet),
  }
}

let registered = false

export function registerAnterPartnerPricingResolver(): void {
  if (registered) return
  registered = true
  registerCatalogPricingResolver(anterPartnerPricingResolver, { priority: 100 })
}

export default registerAnterPartnerPricingResolver
