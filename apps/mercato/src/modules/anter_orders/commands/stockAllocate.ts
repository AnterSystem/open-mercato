import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { z } from 'zod'
import { AnterOrder, AnterOrderLine, AnterStockAllocation } from '../data/entities'
import { allocateOrderLineBestEffort, deriveOrderStatusAfterAllocation } from '../lib/stockAllocation'

const ORDER_RESOURCE_KIND = 'anter_orders.order'
const LIVE_ALLOCATION_STATUSES = ['allocated', 'packed'] as const

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  orderLineId: z.string().uuid(),
})
type StockAllocateInput = z.infer<typeof inputSchema>

type StockAllocateResult = {
  orderLineId: string
  lineStatus: string
  allocatedQuantity: number
  shortfallQuantity: number
  orderStatus: string
  allocationId: string | null
}

type LineSnapshot = { lineStatus: string; expectedAt: string | null }
type BeforeSnapshot = { line: LineSnapshot; order: { status: string; updatedAt: string } } | null

function parseInput(rawInput: unknown): StockAllocateInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_orders.stock.allocate input', issues: result.error.issues })
  }
  return result.data
}

/**
 * Staff-facing re-attempt allocation for a single line still `awaiting_stock`
 * (spec API Contracts: `anter_orders.stock.allocate` — "Allocates a line
 * against available stock", undo "Allocations → released"). Only allocates
 * the line's remaining shortfall — the amount already allocated at placement
 * (if any) is left untouched — and recomputes the order's coarse status from
 * every line's outcome (§3.6), the same derivation `order.place` uses.
 */
const stockAllocateCommand: CommandHandler<unknown, StockAllocateResult> = {
  id: 'anter_orders.stock.allocate',
  isUndoable: true,
  async prepare(rawInput, ctx): Promise<{ before?: BeforeSnapshot }> {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(AnterOrderLine, { id: parsed.orderLineId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!line) return { before: null }
    const order = await em.findOne(AnterOrder, { id: line.orderId })
    if (!order) return { before: null }
    return {
      before: {
        line: { lineStatus: line.lineStatus, expectedAt: line.expectedAt ? line.expectedAt.toISOString() : null },
        order: { status: order.status, updatedAt: order.updatedAt.toISOString() },
      },
    }
  },
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(AnterOrderLine, { id: parsed.orderLineId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!line) throw new CrudHttpError(404, { error: '[internal] order line not found' })

    const order = await em.findOne(AnterOrder, { id: line.orderId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!order) throw new CrudHttpError(404, { error: '[internal] order not found' })

    enforceCommandOptimisticLock({ resourceKind: ORDER_RESOURCE_KIND, resourceId: order.id, current: order.updatedAt, request: ctx.request })

    if (line.lineStatus !== 'awaiting_stock') {
      throw new CrudHttpError(422, { error: '[internal] line is not awaiting stock' })
    }

    const liveAllocations = await em.find(AnterStockAllocation, {
      orderLineId: line.id,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      status: { $in: [...LIVE_ALLOCATION_STATUSES] },
    })
    const alreadyAllocated = liveAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0)
    const remaining = Number(line.quantity) - alreadyAllocated
    if (remaining <= 0) {
      throw new CrudHttpError(422, { error: '[internal] line has no remaining shortfall to allocate' })
    }

    let result!: { allocatedQuantity: number; shortfallQuantity: number }
    let allocationId: string | null = null
    await withAtomicFlush(em, [
      async () => {
        const before = await em.find(AnterStockAllocation, { orderLineId: line.id })
        const beforeIds = new Set(before.map((allocation) => allocation.id))
        result = await allocateOrderLineBestEffort(em, line, {
          orderLineId: line.id,
          productId: line.productId,
          variantId: line.productVariantId ?? null,
          quantity: remaining,
          scope: { organizationId: parsed.organizationId, tenantId: parsed.tenantId },
        })
        const after = await em.find(AnterStockAllocation, { orderLineId: line.id })
        allocationId = after.find((allocation) => !beforeIds.has(allocation.id))?.id ?? null
      },
      async () => {
        const siblingLines = await em.find(AnterOrderLine, { orderId: order.id })
        order.status = deriveOrderStatusAfterAllocation(siblingLines.map((sibling) => sibling.lineStatus))
      },
    ], { transaction: true, label: 'anter_orders.stock.allocate' })

    return {
      orderLineId: line.id,
      lineStatus: line.lineStatus,
      allocatedQuantity: result.allocatedQuantity,
      shortfallQuantity: result.shortfallQuantity,
      orderStatus: order.status,
      allocationId,
    }
  },
  captureAfter: async (_input, result) => ({ orderLineId: result.orderLineId, allocationId: result.allocationId }),
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Allocate Anter order line stock',
    resourceKind: ORDER_RESOURCE_KIND,
    resourceId: result.orderLineId,
    payload: { undo: { before: snapshots.before, allocationId: result.allocationId, orderLineId: result.orderLineId } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: BeforeSnapshot; allocationId: string | null; orderLineId: string }>(logEntry)
    const before = payload?.before
    if (!before || !payload?.orderLineId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(AnterOrderLine, { id: payload.orderLineId })
    if (!line) return
    const order = await em.findOne(AnterOrder, { id: line.orderId })

    await withAtomicFlush(em, [
      () => {
        line.lineStatus = before.line.lineStatus
        line.expectedAt = before.line.expectedAt ? new Date(before.line.expectedAt) : null
        if (order) order.status = before.order.status
      },
    ], { transaction: true, label: 'anter_orders.stock.allocate.undo' })

    if (payload.allocationId) {
      const allocation = await em.findOne(AnterStockAllocation, { id: payload.allocationId })
      if (allocation) {
        await withAtomicFlush(em, [() => { em.remove(allocation) }], { transaction: true, label: 'anter_orders.stock.allocate.undo.releaseAllocation' })
      }
    }
  },
}

registerCommand(stockAllocateCommand)

export default stockAllocateCommand
