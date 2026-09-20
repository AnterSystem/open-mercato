import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterOrder } from '../data/entities'

const ORDER_RESOURCE_KIND = 'anter_orders.order'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  reason: z.string().trim().max(2000).nullable().optional(),
})
type OrderSetTechnicalHoldInput = z.infer<typeof inputSchema>

type OrderSetTechnicalHoldResult = { orderId: string; status: string }
type BeforeSnapshot = { status: string } | null

function parseInput(rawInput: unknown): OrderSetTechnicalHoldInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_orders.order.set_technical_hold input', issues: result.error.issues })
  }
  return result.data
}

/**
 * `anter_orders.order.set_technical_hold` (spec X8): a configurator-sourced
 * order whose technical review is REJECTED after placement — not merely
 * pending — moves to a distinct `technical_hold` status (never silently back
 * to `placed`) so staff can see this order stalled for a review reason, not
 * a stock or payment one. Called only from `anter_configurator`'s
 * `submission.reject` command (§3.2 — `anter_configurator → anter_orders` is
 * the allowed direction; this module never calls back into it).
 */
const orderSetTechnicalHoldCommand: CommandHandler<unknown, OrderSetTechnicalHoldResult> = {
  id: 'anter_orders.order.set_technical_hold',
  isUndoable: true,
  async prepare(rawInput, ctx): Promise<{ before?: BeforeSnapshot }> {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const order = await em.findOne(AnterOrder, { id: parsed.orderId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!order) return { before: null }
    return { before: { status: order.status } }
  },
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const order = await em.findOne(AnterOrder, {
      id: parsed.orderId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      deletedAt: null,
    })
    if (!order) throw new CrudHttpError(404, { error: '[internal] order not found' })

    await withAtomicFlush(em, [
      () => {
        order.status = 'technical_hold'
        order.notes = parsed.reason ? `${order.notes ? `${order.notes}\n` : ''}${parsed.reason}` : order.notes
      },
    ], { transaction: true, label: 'anter_orders.order.set_technical_hold' })

    return { orderId: order.id, status: order.status }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Put Anter order on technical hold',
    resourceKind: ORDER_RESOURCE_KIND,
    resourceId: result.orderId,
    payload: { undo: { before: snapshots.before } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: { status: string } }>(logEntry)
    const orderId = logEntry?.resourceId ?? null
    if (!orderId || !payload?.before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const order = await em.findOne(AnterOrder, { id: orderId })
    if (!order) return

    await withAtomicFlush(em, [
      () => {
        order.status = payload.before.status
      },
    ], { transaction: true, label: 'anter_orders.order.set_technical_hold.undo' })
  },
}

registerCommand(orderSetTechnicalHoldCommand)

export default orderSetTechnicalHoldCommand
