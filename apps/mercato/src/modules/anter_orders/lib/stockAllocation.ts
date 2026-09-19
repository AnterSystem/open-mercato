import { randomUUID } from 'crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { AnterOrderLine, AnterStockAllocation, AnterStockItem } from '../data/entities'
import type { StockScope } from './stock'

export type AllocateLineInput = {
  orderLineId: string
  productId: string
  variantId: string | null
  quantity: number
  scope: StockScope
}

export type AllocateLineResult = {
  allocatedQuantity: number
  shortfallQuantity: number
  expectedRestockAt: Date | null
}

const LIVE_ALLOCATION_STATUSES = ['allocated', 'packed'] as const

/**
 * Best-effort allocation for one order line (spec §Edge Cases: "Stock oversold
 * by concurrent placement" — allocation is written inside the placement
 * transaction and re-reads available quantity under a row lock on
 * `anter_stock_items`; losing requests allocate what remains and mark the
 * shortfall `awaiting_stock`, they do NOT fail). MUST run inside an active
 * transaction (`withAtomicFlush(..., { transaction: true })`) for the lock to
 * hold. Updates the line's own `lineStatus`/`expectedAt` in place; the caller
 * is responsible for recomputing the order-level status afterwards.
 */
export async function allocateOrderLineBestEffort(
  em: EntityManager,
  line: AnterOrderLine,
  input: AllocateLineInput,
): Promise<AllocateLineResult> {
  const stockItem = await em.findOne(
    AnterStockItem,
    {
      productId: input.productId,
      variantId: input.variantId ?? null,
      organizationId: input.scope.organizationId,
      tenantId: input.scope.tenantId,
      deletedAt: null,
    },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  )
  if (!stockItem) {
    line.lineStatus = 'awaiting_stock'
    return { allocatedQuantity: 0, shortfallQuantity: input.quantity, expectedRestockAt: null }
  }

  const liveAllocations = await em.find(AnterStockAllocation, {
    stockItemId: stockItem.id,
    organizationId: input.scope.organizationId,
    tenantId: input.scope.tenantId,
    status: { $in: [...LIVE_ALLOCATION_STATUSES] },
  })
  const alreadyAllocated = liveAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0)
  const available = Math.max(0, stockItem.onHand - alreadyAllocated)
  const allocatedQuantity = Math.min(input.quantity, available)
  const shortfallQuantity = input.quantity - allocatedQuantity

  if (allocatedQuantity > 0) {
    em.create(AnterStockAllocation, {
      id: randomUUID(),
      orderLineId: input.orderLineId,
      stockItemId: stockItem.id,
      quantity: String(allocatedQuantity),
      status: 'allocated',
      organizationId: input.scope.organizationId,
      tenantId: input.scope.tenantId,
    })
  }

  line.lineStatus = shortfallQuantity > 0 ? 'awaiting_stock' : 'allocated'
  line.expectedAt = shortfallQuantity > 0 ? stockItem.expectedRestockAt ?? null : null

  return { allocatedQuantity, shortfallQuantity, expectedRestockAt: stockItem.expectedRestockAt ?? null }
}

const ADVANCED_STATUSES = ['picking', 'shipped_partially', 'shipped', 'delivered']

/**
 * Order-level status derived from its lines' allocation outcome (§3.6),
 * called both right after placement and whenever `stock.allocate` resolves a
 * shortfall later. A short line always forces `awaiting_stock` — the
 * blocking signal staff must see, regardless of what stage the order was
 * already at. Otherwise: an order already at `picking` or later is left
 * alone (allocation clearing a shortfall on an in-flight shipment must never
 * regress it back to `placed`); a not-yet-confirmed order goes to `placed`
 * (§3.6 "confirmed" is `anter_orders.order.confirm`'s own distinct,
 * staff-driven step, decoupled from stock, disambiguated here via
 * `confirmedAt` rather than the single `status` enum); a confirmed order
 * whose last shortfall just cleared advances to `picking` ("every line
 * allocated" — this module treats `allocated` as picking-ready; nothing in
 * this scope's command set ever produces the separate `packed` line status
 * §3.7 also mentions).
 */
export function deriveOrderStatusAfterAllocation(params: {
  currentStatus: string
  confirmedAt: Date | null
  lineStatuses: string[]
}): string {
  if (params.lineStatuses.some((status) => status === 'awaiting_stock')) return 'awaiting_stock'
  if (ADVANCED_STATUSES.includes(params.currentStatus)) return params.currentStatus
  return params.confirmedAt ? 'picking' : 'placed'
}
