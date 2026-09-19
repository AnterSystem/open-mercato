import type { CacheStrategy } from '@open-mercato/cache'
import { createLogger } from '@open-mercato/shared/lib/logger'

const logger = createLogger('anter_orders').child({ component: 'cache' })

const TERMS_CACHE_PREFIX = 'anter:terms'

export const TERMS_CACHE_TTL_MS = 5 * 60 * 1000

export function anterPartnerTermsCacheKey(organizationId: string, customerEntityId: string): string {
  return `${TERMS_CACHE_PREFIX}:${organizationId}:${customerEntityId}`
}

export function resolveCache(container: { resolve: (name: string) => unknown }): CacheStrategy | null {
  try {
    return container.resolve('cache') as CacheStrategy
  } catch {
    return null
  }
}

export async function invalidateAnterPartnerTermsCache(
  cache: CacheStrategy | null | undefined,
  organizationId: string | null | undefined,
  customerEntityId: string | null | undefined,
): Promise<void> {
  if (!cache || !organizationId || !customerEntityId) return
  try {
    await cache.delete(anterPartnerTermsCacheKey(organizationId, customerEntityId))
  } catch (err) {
    logger.warn('Failed to invalidate partner terms cache', { err })
  }
}

const STATS_CACHE_PREFIX = 'anter:stats'

export const STATS_CACHE_TTL_MS = 10 * 60 * 1000

export function anterPartnerStatsCacheKey(organizationId: string, customerEntityId: string): string {
  return `${STATS_CACHE_PREFIX}:${organizationId}:${customerEntityId}`
}

export async function invalidateAnterPartnerStatsCache(
  cache: CacheStrategy | null | undefined,
  organizationId: string | null | undefined,
  customerEntityId: string | null | undefined,
): Promise<void> {
  if (!cache || !organizationId || !customerEntityId) return
  try {
    await cache.delete(anterPartnerStatsCacheKey(organizationId, customerEntityId))
  } catch (err) {
    logger.warn('Failed to invalidate partner stats cache', { err })
  }
}
