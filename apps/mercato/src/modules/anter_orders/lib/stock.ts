import type { EntityManager } from '@mikro-orm/postgresql'
import { AnterStockItem, AnterStockAllocation } from '../data/entities'

export type StockScope = { organizationId: string; tenantId: string }

export type AvailabilityResult = {
  productId: string
  variantId: string | null
  onHand: number
  allocated: number
  available: number
  expectedRestockAt: Date | null
}

const LIVE_ALLOCATION_STATUSES = ['allocated', 'packed'] as const

/**
 * Derives sellable availability for a product/variant as `on_hand - Σ(live
 * allocations)` — Data Model §"Available quantity is derived, never stored".
 * Only `allocated`/`packed` rows count; `shipped`/`released` are excluded so
 * the sum never grows unbounded over terminal allocations (§Performance).
 */
export async function resolveStockAvailability(
  em: EntityManager,
  productId: string,
  variantId: string | null,
  scope: StockScope,
): Promise<AvailabilityResult> {
  const item = await em.findOne(AnterStockItem, {
    productId,
    variantId: variantId ?? null,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    deletedAt: null,
  })
  const onHand = item?.onHand ?? 0
  let allocated = 0
  if (item) {
    const allocations = await em.find(AnterStockAllocation, {
      stockItemId: item.id,
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      status: { $in: [...LIVE_ALLOCATION_STATUSES] },
    })
    allocated = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0)
  }
  return {
    productId,
    variantId: variantId ?? null,
    onHand,
    allocated,
    available: onHand - allocated,
    expectedRestockAt: item?.expectedRestockAt ?? null,
  }
}

export async function resolveStockAvailabilityBatch(
  em: EntityManager,
  entries: Array<{ productId: string; variantId: string | null }>,
  scope: StockScope,
): Promise<Map<string, AvailabilityResult>> {
  const productIds = Array.from(new Set(entries.map((entry) => entry.productId)))
  if (!productIds.length) return new Map()
  const items = await em.find(AnterStockItem, {
    productId: { $in: productIds },
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    deletedAt: null,
  })
  const itemIds = items.map((item) => item.id)
  const allocations = itemIds.length
    ? await em.find(AnterStockAllocation, {
        stockItemId: { $in: itemIds },
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        status: { $in: [...LIVE_ALLOCATION_STATUSES] },
      })
    : []
  const allocatedByItem = new Map<string, number>()
  for (const allocation of allocations) {
    allocatedByItem.set(allocation.stockItemId, (allocatedByItem.get(allocation.stockItemId) ?? 0) + Number(allocation.quantity))
  }

  const byKey = new Map(items.map((item) => [`${item.productId}:${item.variantId ?? ''}`, item]))
  const result = new Map<string, AvailabilityResult>()
  for (const entry of entries) {
    const key = `${entry.productId}:${entry.variantId ?? ''}`
    const item = byKey.get(key)
    const onHand = item?.onHand ?? 0
    const allocated = item ? allocatedByItem.get(item.id) ?? 0 : 0
    result.set(key, {
      productId: entry.productId,
      variantId: entry.variantId ?? null,
      onHand,
      allocated,
      available: onHand - allocated,
      expectedRestockAt: item?.expectedRestockAt ?? null,
    })
  }
  return result
}
