import type { EntityManager } from '@mikro-orm/postgresql'
import { AnterStockItem } from '../data/entities'

export type StockScope = { organizationId: string; tenantId: string }

export type AvailabilityResult = {
  productId: string
  variantId: string | null
  onHand: number
  allocated: number
  available: number
  expectedRestockAt: Date | null
}

/**
 * Derives sellable availability for a product/variant as `on_hand - allocated`.
 * Phase A has no allocations table yet, so `allocated` always resolves to 0
 * and this degenerates to `on_hand` — the shape is kept future-proof so a
 * later allocations ledger can be summed in without changing call sites.
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
  const allocated = 0
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
  const byKey = new Map(items.map((item) => [`${item.productId}:${item.variantId ?? ''}`, item]))
  const result = new Map<string, AvailabilityResult>()
  for (const entry of entries) {
    const key = `${entry.productId}:${entry.variantId ?? ''}`
    const item = byKey.get(key)
    const onHand = item?.onHand ?? 0
    result.set(key, {
      productId: entry.productId,
      variantId: entry.variantId ?? null,
      onHand,
      allocated: 0,
      available: onHand,
      expectedRestockAt: item?.expectedRestockAt ?? null,
    })
  }
  return result
}
