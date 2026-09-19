import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AnterOrder } from '../data/entities'

const ORDER_RESOURCE_KIND = 'anter_orders.order'
const CONFIRMABLE_STATUSES = ['placed', 'awaiting_stock'] as const

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  // Final shipping cost (s41's "final shipping rate", §3.3). Omitted keeps
  // the cart's indicative shipping figure as-is.
  shippingNetAmount: z.coerce.number().min(0).optional(),
})
type OrderConfirmInput = z.infer<typeof inputSchema>

type OrderConfirmResult = {
  orderId: string
  status: string
  confirmedAt: string
  shippingNetAmount: number
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
}

type BeforeSnapshot = {
  status: string
  confirmedAt: string | null
  shippingNetAmount: string
  grandTotalNetAmount: string
  grandTotalGrossAmount: string
} | null

function parseInput(rawInput: unknown): OrderConfirmInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_orders.order.confirm input', issues: result.error.issues })
  }
  return result.data
}

/**
 * Staff confirms the order (spec API Contracts: `anter_orders.order.confirm`
 * — "`placed` → `confirmed`, sets final shipping rate", undo "Back to
 * `placed`, restores previous shipping"). Confirmation is decoupled from
 * stock readiness (§3.6 interpretation, see `orderPlace.ts`'s allocation
 * comment): an `awaiting_stock` order can still be confirmed — staff has
 * reviewed and locked the shipping cost regardless of whether every line is
 * allocated yet. Shipping's tax rate is always 0 in this module (matches
 * `anter_portal/lib/cartTotals.ts` and `orderPlace.ts`'s own shipping line),
 * so a shipping delta shifts net and gross totals by the same amount — no
 * need to re-run the full line-by-line calculation service for this.
 */
const orderConfirmCommand: CommandHandler<unknown, OrderConfirmResult> = {
  id: 'anter_orders.order.confirm',
  isUndoable: true,
  async prepare(rawInput, ctx): Promise<{ before?: BeforeSnapshot }> {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const order = await em.findOne(AnterOrder, { id: parsed.orderId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!order) return { before: null }
    return {
      before: {
        status: order.status,
        confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
        shippingNetAmount: order.shippingNetAmount,
        grandTotalNetAmount: order.grandTotalNetAmount,
        grandTotalGrossAmount: order.grandTotalGrossAmount,
      },
    }
  },
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const order = await findOneWithDecryption(em, AnterOrder, {
      id: parsed.orderId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      deletedAt: null,
    }, undefined, { tenantId: parsed.tenantId, organizationId: parsed.organizationId })
    if (!order) throw new CrudHttpError(404, { error: '[internal] order not found' })

    enforceCommandOptimisticLock({ resourceKind: ORDER_RESOURCE_KIND, resourceId: order.id, current: order.updatedAt, request: ctx.request })

    if (!CONFIRMABLE_STATUSES.includes(order.status as typeof CONFIRMABLE_STATUSES[number])) {
      throw new CrudHttpError(422, { error: '[internal] order is not in a confirmable status', status: order.status })
    }

    const previousShipping = Number(order.shippingNetAmount)
    const nextShipping = parsed.shippingNetAmount ?? previousShipping
    const shippingDelta = nextShipping - previousShipping
    const confirmedAt = new Date()

    await withAtomicFlush(em, [
      () => {
        order.status = 'confirmed'
        order.confirmedAt = confirmedAt
        order.shippingNetAmount = String(nextShipping)
        order.grandTotalNetAmount = String(Number(order.grandTotalNetAmount) + shippingDelta)
        order.grandTotalGrossAmount = String(Number(order.grandTotalGrossAmount) + shippingDelta)
      },
    ], { transaction: true, label: 'anter_orders.order.confirm' })

    return {
      orderId: order.id,
      status: order.status,
      confirmedAt: confirmedAt.toISOString(),
      shippingNetAmount: Number(order.shippingNetAmount),
      grandTotalNetAmount: Number(order.grandTotalNetAmount),
      grandTotalGrossAmount: Number(order.grandTotalGrossAmount),
    }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Confirm Anter order',
    resourceKind: ORDER_RESOURCE_KIND,
    resourceId: result.orderId,
    payload: { undo: { before: snapshots.before } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: BeforeSnapshot }>(logEntry)
    const orderId = logEntry?.resourceId ?? null
    const before = payload?.before
    if (!before || !orderId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const order = await em.findOne(AnterOrder, { id: orderId })
    if (!order) return

    await withAtomicFlush(em, [
      () => {
        order.status = before.status
        order.confirmedAt = before.confirmedAt ? new Date(before.confirmedAt) : null
        order.shippingNetAmount = before.shippingNetAmount
        order.grandTotalNetAmount = before.grandTotalNetAmount
        order.grandTotalGrossAmount = before.grandTotalGrossAmount
      },
    ], { transaction: true, label: 'anter_orders.order.confirm.undo' })
  },
}

registerCommand(orderConfirmCommand)

export default orderConfirmCommand
