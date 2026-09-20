import type { EntityManager } from '@mikro-orm/postgresql'
import { AnterPartnerPriceListScope } from '../data/entities'

export type AnterPartnerPriceListScopeScope = { organizationId: string; tenantId: string }

export type AnterPartnerPriceListScopeService = {
  /** Configurator spec X3: no rows means everything is included. */
  getExcludedCategoryIds(partnerTermsId: string, scope: AnterPartnerPriceListScopeScope): Promise<Set<string>>
}

export function createAnterPartnerPriceListScopeService(deps: { em: EntityManager }): AnterPartnerPriceListScopeService {
  const { em } = deps
  return {
    async getExcludedCategoryIds(partnerTermsId, scope) {
      const rows = await em.find(AnterPartnerPriceListScope, {
        partnerTermsId,
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
      })
      return new Set(rows.map((row) => row.catalogCategoryId))
    },
  }
}

export default createAnterPartnerPriceListScopeService
