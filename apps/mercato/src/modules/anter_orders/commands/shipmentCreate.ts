import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterOrder, AnterOrderLine, AnterShipment, AnterShipmentLine, AnterStockAllocation } from '../data/entities'
import { consumeAllocationsForShipment } from '../lib/shipmentAllocation'
import { deriveOrderStatusAfterAllocation } from '../lib/stockAllocation'

const ORDER_RESOURCE_KIND = 'anter_orders.order'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  weightKg: z.coerce.number().min(0).optional(),
  packageCount: z.coerce.number().int().min(0).optional(),
  shippingCostNet: z.coerce.number().min(0).optional(),
  lines: z.array(z.object({
    orderLineId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
  })).min(1),
})
type ShipmentCreateInput = z.infer<typeof inputSchema>

type ShipmentCreateResult = {
  shipmentId: string
  shipmentNumber: string
  orderStatus: string
}

function parseInput(rawInput: unknown): ShipmentCreateInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_orders.shipment.create input', issues: result.error.issues })
  }
  return result.data
}

type ShipmentSnapshot = { shipmentId: string; lineIds: string[]; consumedOrderLineIds: string[] } | null

/**
 * s41: creates a shipment from selected lines/quantities (spec API
 * Contracts). Ships only what's already allocated — `consumeAllocationsForShipment`
 * throws if a selected quantity exceeds the line's live allocation, so this
 * command can never ship stock that was never reserved. Recomputes each
 * shipped line's `shippedQuantity`/`lineStatus` and the order's coarse status
 * (`shipped_partially` while any line remains open, `shipped` — with
 * `closedAt` set — once every line's shipped quantity reaches its ordered
 * quantity, per §Edge Cases "Last line ships").
 */
const shipmentCreateCommand: CommandHandler<unknown, ShipmentCreateResult> = {
  id: 'anter_orders.shipment.create',
  isUndoable: true,
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const order = await em.findOne(AnterOrder, { id: parsed.orderId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!order) throw new CrudHttpError(404, { error: '[internal] order not found' })

    enforceCommandOptimisticLock({ resourceKind: ORDER_RESOURCE_KIND, resourceId: order.id, current: order.updatedAt, request: ctx.request })

    // Every line on the order, not just the ones in this shipment: the status
    // derivation below asks whether EVERY line is fully shipped. Loading only
    // the shipped subset made that check trivially true, so a partial shipment
    // closed the order as `shipped` and `shipped_partially` was unreachable.
    const orderLines = await em.find(AnterOrderLine, { orderId: order.id })
    const orderLineById = new Map(orderLines.map((line) => [line.id, line]))
    for (const entry of parsed.lines) {
      const line = orderLineById.get(entry.orderLineId)
      if (!line) throw new CrudHttpError(404, { error: '[internal] order line not found', orderLineId: entry.orderLineId })
      const remaining = Number(line.quantity) - Number(line.shippedQuantity)
      if (entry.quantity > remaining) {
        throw new CrudHttpError(422, { error: '[internal] shipped quantity exceeds the line\'s remaining quantity', orderLineId: entry.orderLineId })
      }
    }

    const shipmentId = randomUUID()
    let shipmentNumber = ''

    await withAtomicFlush(em, [
      async () => {
        const existingShipmentCount = await em.count(AnterShipment, { orderId: order.id })
        shipmentNumber = `${order.orderNumber}-S${existingShipmentCount + 1}`
        em.create(AnterShipment, {
          id: shipmentId,
          orderId: order.id,
          shipmentNumber,
          sequenceNumber: existingShipmentCount + 1,
          status: 'planned',
          weightKg: parsed.weightKg != null ? String(parsed.weightKg) : null,
          packageCount: parsed.packageCount ?? null,
          shippingCostNet: parsed.shippingCostNet != null ? String(parsed.shippingCostNet) : '0',
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        })
        for (const entry of parsed.lines) {
          em.create(AnterShipmentLine, {
            id: randomUUID(),
            shipmentId,
            orderLineId: entry.orderLineId,
            quantity: String(entry.quantity),
            organizationId: parsed.organizationId,
            tenantId: parsed.tenantId,
          })
        }
      },
      async () => {
        for (const entry of parsed.lines) {
          await consumeAllocationsForShipment(em, entry.orderLineId, entry.quantity, { organizationId: parsed.organizationId, tenantId: parsed.tenantId })
          const line = orderLineById.get(entry.orderLineId)!
          line.shippedQuantity = String(Number(line.shippedQuantity) + entry.quantity)
          line.lineStatus = Number(line.shippedQuantity) >= Number(line.quantity) ? 'shipped' : line.lineStatus
        }
      },
      () => {
        const allLines = orderLines
        const allShipped = allLines.every((line) => Number(line.shippedQuantity) >= Number(line.quantity))
        const anyShipped = allLines.some((line) => Number(line.shippedQuantity) > 0)
        if (allShipped) {
          order.status = 'shipped'
          order.closedAt = new Date()
        } else if (anyShipped) {
          order.status = 'shipped_partially'
        } else {
          order.status = deriveOrderStatusAfterAllocation({
            currentStatus: order.status,
            confirmedAt: order.confirmedAt ?? null,
            lineStatuses: allLines.map((line) => line.lineStatus),
          })
        }
      },
    ], { transaction: true, label: 'anter_orders.shipment.create' })

    return { shipmentId, shipmentNumber, orderStatus: order.status }
  },
  captureAfter: async (_input, result) => ({ shipmentId: result.shipmentId }),
  buildLog: async ({ result }) => ({
    actionLabel: 'Create Anter shipment',
    resourceKind: ORDER_RESOURCE_KIND,
    resourceId: result.shipmentId,
    payload: { undo: { shipmentId: result.shipmentId } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ shipmentId: string }>(logEntry)
    const shipmentId = payload?.shipmentId ?? logEntry?.resourceId ?? null
    if (!shipmentId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const shipment = await em.findOne(AnterShipment, { id: shipmentId })
    if (!shipment) return
    const shipmentLines = await em.find(AnterShipmentLine, { shipmentId })
    const order = await em.findOne(AnterOrder, { id: shipment.orderId })

    await withAtomicFlush(em, [
      async () => {
        for (const shipmentLine of shipmentLines) {
          const line = await em.findOne(AnterOrderLine, { id: shipmentLine.orderLineId })
          if (!line) continue
          line.shippedQuantity = String(Math.max(0, Number(line.shippedQuantity) - Number(shipmentLine.quantity)))
          line.lineStatus = 'allocated'
          const shippedAllocations = await em.find(AnterStockAllocation, { orderLineId: line.id, status: 'shipped' })
          for (const allocation of shippedAllocations) allocation.status = 'allocated'
        }
      },
      () => {
        for (const shipmentLine of shipmentLines) em.remove(shipmentLine)
        em.remove(shipment)
        if (order) order.status = 'confirmed'
      },
    ], { transaction: true, label: 'anter_orders.shipment.create.undo' })
  },
}

registerCommand(shipmentCreateCommand)

export default shipmentCreateCommand
