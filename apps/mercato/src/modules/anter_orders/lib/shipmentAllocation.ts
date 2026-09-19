import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterStockAllocation } from '../data/entities'
import type { StockScope } from './stock'

const LIVE_ALLOCATION_STATUSES = ['allocated', 'packed'] as const

/**
 * Marks `quantity` worth of an order line's live allocations `shipped`
 * (FIFO over `allocated`/`packed` rows, oldest first). An allocation row
 * larger than the shipped amount is split: the original row keeps the
 * remainder, and a new `shipped` row is created for the shipped slice — the
 * ledger stays a single source of truth for "how much of this line is where"
 * (Data Model §"Available quantity is derived, never stored").
 *
 * Throws 422 if the line doesn't have `quantity` worth of live allocation to
 * ship — `shipment.create` must never ship more than was actually allocated.
 */
export async function consumeAllocationsForShipment(
  em: EntityManager,
  orderLineId: string,
  quantity: number,
  scope: StockScope,
): Promise<void> {
  const allocations = await em.find(AnterStockAllocation, {
    orderLineId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    status: { $in: [...LIVE_ALLOCATION_STATUSES] },
  }, { orderBy: { createdAt: 'asc' } })

  const totalLive = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0)
  if (totalLive < quantity) {
    throw new CrudHttpError(422, { error: '[internal] line does not have enough allocated stock to ship this quantity' })
  }

  let remaining = quantity
  for (const allocation of allocations) {
    if (remaining <= 0) break
    const allocationQuantity = Number(allocation.quantity)
    if (allocationQuantity <= remaining) {
      allocation.status = 'shipped'
      remaining -= allocationQuantity
    } else {
      allocation.quantity = String(allocationQuantity - remaining)
      em.create(AnterStockAllocation, {
        id: randomUUID(),
        orderLineId,
        stockItemId: allocation.stockItemId,
        quantity: String(remaining),
        status: 'shipped',
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
      })
      remaining = 0
    }
  }
}

export default consumeAllocationsForShipment
