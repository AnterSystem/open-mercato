import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterOrder, AnterShipment } from '../data/entities'
import { emitAnterOrdersEvent } from '../events'

const SHIPMENT_RESOURCE_KIND = 'anter_orders.shipment'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  shipmentId: z.string().uuid(),
  carrierName: z.string().trim().min(1).max(128),
  trackingNumber: z.string().trim().min(1).max(128),
})
type ShipmentDispatchInput = z.infer<typeof inputSchema>

type ShipmentDispatchResult = { shipmentId: string; status: string; dispatchedAt: string }
type BeforeSnapshot = { status: string; carrierName: string | null; trackingNumber: string | null; dispatchedAt: string | null } | null

function parseInput(rawInput: unknown): ShipmentDispatchInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_orders.shipment.dispatch input', issues: result.error.issues })
  }
  return result.data
}

/**
 * Records carrier, tracking number and dispatch date (spec API Contracts).
 * Emits `order.shipped_partially` / `order.shipped` per the order's current
 * status so `anter_orders`'s own CRM subscribers (Phase E) and the portal
 * timeline (Phase D) react — dispatch is the moment a shipment becomes
 * visible/trackable to the partner, not `shipment.create`.
 */
const shipmentDispatchCommand: CommandHandler<unknown, ShipmentDispatchResult> = {
  id: 'anter_orders.shipment.dispatch',
  isUndoable: true,
  async prepare(rawInput, ctx): Promise<{ before?: BeforeSnapshot }> {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const shipment = await em.findOne(AnterShipment, { id: parsed.shipmentId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!shipment) return { before: null }
    return {
      before: {
        status: shipment.status,
        carrierName: shipment.carrierName ?? null,
        trackingNumber: shipment.trackingNumber ?? null,
        dispatchedAt: shipment.dispatchedAt ? shipment.dispatchedAt.toISOString() : null,
      },
    }
  },
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const shipment = await em.findOne(AnterShipment, { id: parsed.shipmentId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!shipment) throw new CrudHttpError(404, { error: '[internal] shipment not found' })

    enforceCommandOptimisticLock({ resourceKind: SHIPMENT_RESOURCE_KIND, resourceId: shipment.id, current: shipment.updatedAt, request: ctx.request })

    if (shipment.status !== 'planned') {
      throw new CrudHttpError(422, { error: '[internal] shipment is not in a dispatchable status', status: shipment.status })
    }

    const dispatchedAt = new Date()
    await withAtomicFlush(em, [
      () => {
        shipment.status = 'dispatched'
        shipment.carrierName = parsed.carrierName
        shipment.trackingNumber = parsed.trackingNumber
        shipment.dispatchedAt = dispatchedAt
      },
    ], { transaction: true, label: 'anter_orders.shipment.dispatch' })

    const order = await em.findOne(AnterOrder, { id: shipment.orderId })
    if (order) {
      const eventId = order.status === 'shipped' ? 'anter_orders.order.shipped' : 'anter_orders.order.shipped_partially'
      await emitAnterOrdersEvent(eventId, {
        id: order.id,
        orderNumber: order.orderNumber,
        customerEntityId: order.customerEntityId,
        customerUserId: order.customerUserId,
        organizationId: order.organizationId,
        tenantId: order.tenantId,
        shipmentId: shipment.id,
        shipmentNumber: shipment.shipmentNumber,
      }, { persistent: true, tenantId: order.tenantId, organizationId: order.organizationId })
    }

    return { shipmentId: shipment.id, status: shipment.status, dispatchedAt: dispatchedAt.toISOString() }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Dispatch Anter shipment',
    resourceKind: SHIPMENT_RESOURCE_KIND,
    resourceId: result.shipmentId,
    payload: { undo: { before: snapshots.before } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: BeforeSnapshot }>(logEntry)
    const before = payload?.before
    const shipmentId = logEntry?.resourceId ?? null
    if (!before || !shipmentId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const shipment = await em.findOne(AnterShipment, { id: shipmentId })
    if (!shipment) return

    await withAtomicFlush(em, [
      () => {
        shipment.status = before.status
        shipment.carrierName = before.carrierName
        shipment.trackingNumber = before.trackingNumber
        shipment.dispatchedAt = before.dispatchedAt ? new Date(before.dispatchedAt) : null
      },
    ], { transaction: true, label: 'anter_orders.shipment.dispatch.undo' })
  },
}

registerCommand(shipmentDispatchCommand)

export default shipmentDispatchCommand
