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

/**
 * Order-level status derived from its lines' allocation outcome right after
 * placement (§3.6): any short line keeps the order `awaiting_stock`; a fully
 * allocated order stays `placed` — pending is `confirmed` remains a distinct,
 * staff-driven step (`anter_orders.order.confirm`), decoupled from stock.
 */
export function deriveOrderStatusAfterAllocation(lineStatuses: string[]): 'placed' | 'awaiting_stock' {
  return lineStatuses.some((status) => status === 'awaiting_stock') ? 'awaiting_stock' : 'placed'
}
