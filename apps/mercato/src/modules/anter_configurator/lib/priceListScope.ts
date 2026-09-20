import type { EntityManager } from '@mikro-orm/postgresql'
import { CatalogProductCategoryAssignment } from '@open-mercato/core/modules/catalog/data/entities'
import type { AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'
import type { AnterPartnerPriceListScopeService } from '../../anter_orders/services/anterPartnerPriceListScopeService'

/**
 * Resolves which of `productIds` fall outside a partner's price-list scope
 * (spec X3, C14 `outside_price_list`) — drives s9's dashed rendering in
 * internal mode. `customerEntityId: null` (no bound partner) means nothing
 * is out of scope; there is no partner to be out of scope of.
 */
export async function resolveOutsidePriceListProductIds(input: {
  em: EntityManager
  anterPartnerTermsService: AnterPartnerTermsService
  anterPartnerPriceListScopeService: AnterPartnerPriceListScopeService
  customerEntityId: string | null
  productIds: string[]
  scope: { organizationId: string; tenantId: string }
}): Promise<Set<string>> {
  if (!input.customerEntityId || !input.productIds.length) return new Set()

  const terms = await input.anterPartnerTermsService.getByCustomerEntityId(input.customerEntityId, input.scope)
  if (!terms) return new Set()

  const excludedCategoryIds = await input.anterPartnerPriceListScopeService.getExcludedCategoryIds(terms.id, input.scope)
  if (!excludedCategoryIds.size) return new Set()

  const assignments = await input.em.find(CatalogProductCategoryAssignment, {
    organizationId: input.scope.organizationId,
    tenantId: input.scope.tenantId,
    product: { $in: input.productIds },
  })

  const outside = new Set<string>()
  for (const assignment of assignments) {
    const productId = typeof assignment.product === 'string' ? assignment.product : assignment.product.id
    const categoryId = typeof assignment.category === 'string' ? assignment.category : assignment.category.id
    if (excludedCategoryIds.has(categoryId)) outside.add(productId)
  }
  return outside
}
