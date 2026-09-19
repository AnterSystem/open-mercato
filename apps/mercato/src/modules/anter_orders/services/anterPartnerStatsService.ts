import type { EntityManager } from '@mikro-orm/postgresql'
import type { CacheStrategy } from '@open-mercato/cache'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { AnterOrder } from '../data/entities'
import { anterPartnerStatsCacheKey, STATS_CACHE_TTL_MS } from '../lib/cache'

const logger = createLogger('anter_orders').child({ component: 'anterPartnerStatsService' })

const ROLLING_TURNOVER_WINDOW_DAYS = 365

export type AnterPartnerStatsScope = { organizationId: string; tenantId: string }

export type AnterPartnerStats = {
  lastOrderAt: string | null
  rollingTurnoverNetAmount: number
  orderCount: number
}

export type AnterPartnerStatsService = {
  getByCustomerEntityId(customerEntityId: string, scope: AnterPartnerStatsScope): Promise<AnterPartnerStats>
}

const EMPTY_STATS: AnterPartnerStats = { lastOrderAt: null, rollingTurnoverNetAmount: 0, orderCount: 0 }

/**
 * Partner-card figures (s16): last order date, rolling 12-month turnover,
 * order count — computed on read from `anter_orders`' own table, never
 * denormalised onto `customers` (spec §3.8). Cached 10 minutes per
 * §Performance (`anter:stats:<orgId>:<customerEntityId>`), invalidated by
 * `anter_orders.order.placed`/`.shipped`/`.delivered` (see the
 * `subscribers/*-crm-activity.ts` files, which call `invalidateAnterPartnerStatsCache`
 * alongside recording the CRM activity).
 */
export function createAnterPartnerStatsService(deps: {
  em: EntityManager
  cache?: CacheStrategy | null
}): AnterPartnerStatsService {
  const { em, cache } = deps

  return {
    async getByCustomerEntityId(customerEntityId, scope) {
      if (!customerEntityId) return EMPTY_STATS
      const key = anterPartnerStatsCacheKey(scope.organizationId, customerEntityId)

      if (cache) {
        try {
          const cached = await cache.get(key)
          if (cached != null) return cached as AnterPartnerStats
        } catch {
          // Fall through to an uncached read.
        }
      }

      const orders = await em.find(AnterOrder, {
        customerEntityId,
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        deletedAt: null,
      })

      const windowStart = new Date(Date.now() - ROLLING_TURNOVER_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      const ordersInWindow = orders.filter((order) => order.placedAt != null && order.placedAt >= windowStart)
      const lastOrderAt = orders.reduce<Date | null>((latest, order) => {
        if (!order.placedAt) return latest
        return !latest || order.placedAt > latest ? order.placedAt : latest
      }, null)

      const stats: AnterPartnerStats = {
        lastOrderAt: lastOrderAt ? lastOrderAt.toISOString() : null,
        rollingTurnoverNetAmount: ordersInWindow.reduce((sum, order) => sum + Number(order.subtotalNetAmount), 0),
        orderCount: orders.length,
      }

      if (cache) {
        try {
          await cache.set(key, stats, {
            ttl: STATS_CACHE_TTL_MS,
            tags: [key, `tenant:${scope.tenantId}`, `org:${scope.organizationId}`],
          })
        } catch (err) {
          logger.warn('Failed to cache partner stats', { err })
        }
      }

      return stats
    },
  }
}

export default createAnterPartnerStatsService
