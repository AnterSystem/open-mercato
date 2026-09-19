import type { CacheStrategy } from '@open-mercato/cache'
import { createLogger } from '@open-mercato/shared/lib/logger'

const logger = createLogger('anter_portal').child({ component: 'catalogCache' })

const CATALOG_CACHE_PREFIX = 'anter:catalog'

export const CATALOG_CACHE_TTL_MS = 60 * 1000

/**
 * Caches the product + list-price layer ONLY (spec §Performance) — never
 * partner price or availability, both resolved fresh per request on top of
 * this. TTL 60s bounds staleness against catalogue edits; this key does not
 * yet subscribe to `catalog.product.updated`/`.deleted` for point
 * invalidation (a later pass — the 60s ceiling makes it a staleness-vs-
 * freshness tradeoff, not a correctness one, since price/availability are
 * never part of what's cached here).
 */
export function anterCatalogPageCacheKey(
  organizationId: string,
  categoryId: string | null | undefined,
  page: number,
  q: string | null | undefined,
): string {
  return `${CATALOG_CACHE_PREFIX}:${organizationId}:${categoryId ?? ''}:${page}:${q ?? ''}`
}

export function resolveCache(container: { resolve: (name: string) => unknown }): CacheStrategy | null {
  try {
    return container.resolve('cache') as CacheStrategy
  } catch {
    return null
  }
}

export async function getCachedCatalogPage<T>(
  cache: CacheStrategy | null | undefined,
  key: string,
): Promise<T | null> {
  if (!cache) return null
  try {
    const cached = await cache.get(key)
    return cached != null ? (cached as T) : null
  } catch {
    return null
  }
}

export async function setCachedCatalogPage<T>(
  cache: CacheStrategy | null | undefined,
  key: string,
  value: T,
  scope: { organizationId: string; tenantId: string },
): Promise<void> {
  if (!cache) return
  try {
    await cache.set(key, value, {
      ttl: CATALOG_CACHE_TTL_MS,
      tags: [key, `tenant:${scope.tenantId}`, `org:${scope.organizationId}`, 'catalog'],
    })
  } catch (err) {
    logger.warn('Failed to cache catalogue page', { err })
  }
}
