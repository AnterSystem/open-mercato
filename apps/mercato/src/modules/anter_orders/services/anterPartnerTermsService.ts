import type { EntityManager } from '@mikro-orm/postgresql'
import type { CacheStrategy } from '@open-mercato/cache'
import { AnterPartnerTerms } from '../data/entities'
import { anterPartnerTermsCacheKey, TERMS_CACHE_TTL_MS } from '../lib/cache'

export type AnterPartnerTermsRecord = {
  id: string
  customerEntityId: string
  defaultDiscountRate: number
  priceListCode: string | null
  isBlocked: boolean
  accountType: string
  accountOwnerUserId: string | null
}

export type AnterPartnerTermsScope = {
  organizationId: string
  tenantId: string
}

export type AnterPartnerTermsService = {
  getByCustomerEntityId(customerEntityId: string, scope: AnterPartnerTermsScope): Promise<AnterPartnerTermsRecord | null>
}

function toRecord(entity: AnterPartnerTerms): AnterPartnerTermsRecord {
  return {
    id: entity.id,
    customerEntityId: entity.customerEntityId,
    defaultDiscountRate: Number(entity.defaultDiscountRate),
    priceListCode: entity.priceListCode ?? null,
    isBlocked: entity.isBlocked,
    accountType: entity.accountType,
    accountOwnerUserId: entity.accountOwnerUserId ?? null,
  }
}

/**
 * Resolves partner terms by `customerEntityId`, cached for 5 minutes per
 * spec §Performance (`anter:terms:<orgId>:<customerEntityId>`). Cache
 * resolution failures degrade to an uncached DB read — never a hard error.
 */
export function createAnterPartnerTermsService(deps: {
  em: EntityManager
  cache?: CacheStrategy | null
}): AnterPartnerTermsService {
  const { em, cache } = deps
  return {
    async getByCustomerEntityId(customerEntityId, scope) {
      if (!customerEntityId) return null
      const key = anterPartnerTermsCacheKey(scope.organizationId, customerEntityId)

      if (cache) {
        try {
          const cached = await cache.get(key)
          if (cached !== null && cached !== undefined) {
            return cached as AnterPartnerTermsRecord | null
          }
        } catch {
          // Fall through to an uncached DB read.
        }
      }

      const entity = await em.findOne(AnterPartnerTerms, {
        customerEntityId,
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        deletedAt: null,
      })
      const record = entity ? toRecord(entity) : null

      if (cache) {
        try {
          // §Performance: "every key carries tenant:<id> and org:<id> tags" —
          // a tenant-wide purge is one `deleteByTags` call.
          await cache.set(key, record, { ttl: TERMS_CACHE_TTL_MS, tags: [key, `tenant:${scope.tenantId}`, `org:${scope.organizationId}`] })
        } catch {
          // Caching is best-effort; a miss just means the next read hits the DB again.
        }
      }

      return record
    },
  }
}

export default createAnterPartnerTermsService
