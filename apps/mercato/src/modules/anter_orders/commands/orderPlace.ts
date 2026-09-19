import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { SalesLineSnapshot } from '@open-mercato/core/modules/sales/lib/types'
import { AnterOrder, AnterOrderLine, AnterStockAllocation } from '../data/entities'
import { allocateOrderLineBestEffort, deriveOrderStatusAfterAllocation } from '../lib/stockAllocation'
import { anterOrderPlaceSchema, type AnterOrderPlaceInput } from '../data/validators'
import type { AnterOrderNumberService } from '../services/anterOrderNumberService'
import { createAnterFallbackCalculationService, type OrderCalculationService } from '../services/anterFallbackCalculationService'
import { emitAnterOrdersEvent } from '../events'

const logger = createLogger('anter_orders').child({ component: 'commands.orderPlace' })

type OrderPlaceResult = {
  orderId: string
  orderNumber: string
  status: string
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
}

type OrderSnapshot = {
  order: {
    id: string
    orderNumber: string
    customerEntityId: string
    customerUserId: string
    organizationId: string
    tenantId: string
  }
  lineIds: string[]
} | null

/**
 * Resolves the shared `sales.salesCalculationService` when the `sales` module
 * is enabled. Falls back to `anterFallbackCalculationService` otherwise (spec
 * Implementation Plan step 16 — Anter must keep working with `sales`
 * disabled). This is a soft-optional peer resolve per
 * `packages/core/AGENTS.md` § Cross-Module Coupling: `anter_orders` never
 * hard-requires `sales`, and `sales` never knows Anter exists.
 */
function resolveCalculationService(ctx: CommandRuntimeContext): OrderCalculationService {
  try {
    const service = ctx.container.resolve<OrderCalculationService>('salesCalculationService')
    if (service && typeof service.calculateDocumentTotals === 'function') return service
  } catch {
    logger.debug('[internal] salesCalculationService unavailable, using anterFallbackCalculationService')
  }
  return createAnterFallbackCalculationService()
}

function parseInput(rawInput: unknown): AnterOrderPlaceInput {
  const result = anterOrderPlaceSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_orders.order.place input', issues: result.error.issues })
  }
  return result.data
}

async function loadOrderSnapshot(em: EntityManager, orderId: string): Promise<OrderSnapshot> {
  const order = await em.findOne(AnterOrder, { id: orderId })
  if (!order) return null
  const lines = await em.find(AnterOrderLine, { orderId: order.id })
  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      customerEntityId: order.customerEntityId,
      customerUserId: order.customerUserId,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
    },
    lineIds: lines.map((line) => line.id),
  }
}

/**
 * `anter_orders.order.place` (spec §3.3/§3.5/§3.6, Implementation Plan step
 * 12). Persists `AnterOrder` + `AnterOrderLine` rows from lines that were
 * ALREADY re-priced by the caller (`anter_portal`'s checkout service, per
 * §3.4 — this command never re-resolves partner prices itself) and computes
 * totals exactly once via `salesCalculationService.calculateDocumentTotals`,
 * storing the returned `SalesDocumentAmounts` verbatim (§3.5: "Anter ...
 * never recomputes them").
 *
 * Cross-module boundary (spec §3.2: "`anter_orders` never imports from
 * `anter_portal` ... the order module does not know a cart exists beyond an
 * id it stores for traceability"): this command does NOT read or mutate
 * `anter_carts` in any way, including via raw SQL — `sourceCartId` is stored
 * on `AnterOrder` purely as an opaque traceability id. Flipping the source
 * cart's `status` to `converted` (and, on undo, restoring it to `active`) is
 * the caller's responsibility — `anter_portal`'s checkout orchestration owns
 * its own `AnterCart` row (which already carries a `convertedOrderId` FK-id
 * column for this) and performs that update itself after this command
 * succeeds. This keeps the FK-id + snapshot pattern (no ORM relation, no
 * cross-module write) intact in both directions.
 *
 * Phase B adds best-effort stock allocation (§Edge Cases "Stock oversold by
 * concurrent placement") as a second flush-boundary phase, inside the same
 * transaction: each line takes a row lock on its `anter_stock_items` row,
 * allocates what it can, and a shortfall keeps the line/order `awaiting_stock`
 * rather than failing the whole placement.
 */
const orderPlaceCommand: CommandHandler<unknown, OrderPlaceResult> = {
  id: 'anter_orders.order.place',
  isUndoable: true,
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const calculationService = resolveCalculationService(ctx)
    const orderNumberService = ctx.container.resolve<AnterOrderNumberService>('anterOrderNumberService')

    const productLines: SalesLineSnapshot[] = parsed.lines.map((line) => ({
      kind: 'product',
      productId: line.productId,
      productVariantId: line.productVariantId ?? null,
      name: line.nameSnapshot,
      quantity: line.quantity,
      currencyCode: parsed.currencyCode,
      unitPriceNet: line.unitPriceNet,
      taxRate: line.taxRate,
    }))
    const shippingLine: SalesLineSnapshot = {
      kind: 'shipping',
      name: 'Shipping',
      quantity: 1,
      currencyCode: parsed.currencyCode,
      unitPriceNet: parsed.shippingNetAmount,
      taxRate: 0,
    }

    const calculation = await calculationService.calculateDocumentTotals({
      documentKind: 'order',
      lines: [...productLines, shippingLine],
      context: {
        tenantId: parsed.tenantId,
        organizationId: parsed.organizationId,
        currencyCode: parsed.currencyCode,
      },
    })

    const orderNumber = await orderNumberService.generate({
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
    })

    const orderId = randomUUID()
    let order!: AnterOrder
    const orderLines: AnterOrderLine[] = []

    await withAtomicFlush(em, [
      () => {
        order = em.create(AnterOrder, {
          id: orderId,
          orderNumber,
          customerEntityId: parsed.customerEntityId,
          customerUserId: parsed.customerUserId,
          currencyCode: parsed.currencyCode,
          deliveryMode: parsed.deliveryMode,
          deliveryAddressSnapshot: parsed.deliveryAddressSnapshot ?? null,
          paymentTermsDays: parsed.paymentTermsDays,
          subtotalNetAmount: String(calculation.totals.subtotalNetAmount),
          discountTotalAmount: String(calculation.totals.discountTotalAmount ?? 0),
          shippingNetAmount: String(calculation.totals.shippingNetAmount ?? parsed.shippingNetAmount),
          taxTotalAmount: String(calculation.totals.taxTotalAmount ?? 0),
          grandTotalNetAmount: String(calculation.totals.grandTotalNetAmount),
          grandTotalGrossAmount: String(calculation.totals.grandTotalGrossAmount),
          partnerReference: parsed.partnerReference ?? null,
          notes: parsed.notes ?? null,
          sourceCartId: parsed.sourceCartId ?? null,
          placedAt: new Date(),
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        })

        parsed.lines.forEach((line, index) => {
          const calculatedLine = calculation.lines[index]
          const lineEntity = em.create(AnterOrderLine, {
            id: randomUUID(),
            orderId,
            lineNumber: index + 1,
            productId: line.productId,
            productVariantId: line.productVariantId ?? null,
            sku: line.sku ?? null,
            nameSnapshot: line.nameSnapshot,
            variantSnapshot: line.variantSnapshot ?? null,
            quantity: String(line.quantity),
            unitCode: line.unitCode ?? null,
            listUnitPriceNet: String(line.listUnitPriceNet),
            unitPriceNet: String(line.unitPriceNet),
            discountAmount: String(calculatedLine?.discountAmount ?? 0),
            taxRate: String(line.taxRate ?? 0),
            netAmount: String(calculatedLine?.netAmount ?? 0),
            grossAmount: String(calculatedLine?.grossAmount ?? 0),
            organizationId: parsed.organizationId,
            tenantId: parsed.tenantId,
          })
          orderLines.push(lineEntity)
        })
      },
      // Separate flush boundary (SPEC-018): allocation reads must see the
      // just-flushed order/line rows before taking their own row lock.
      async () => {
        const lineStatuses: string[] = []
        for (const lineEntity of orderLines) {
          const result = await allocateOrderLineBestEffort(em, lineEntity, {
            orderLineId: lineEntity.id,
            productId: lineEntity.productId,
            variantId: lineEntity.productVariantId ?? null,
            quantity: Number(lineEntity.quantity),
            scope: { organizationId: parsed.organizationId, tenantId: parsed.tenantId },
          })
          lineStatuses.push(lineEntity.lineStatus)
          void result
        }
        order.status = deriveOrderStatusAfterAllocation({ currentStatus: order.status, confirmedAt: order.confirmedAt ?? null, lineStatuses })
      },
    ], { transaction: true, label: 'anter_orders.order.place' })

    await emitAnterOrdersEvent('anter_orders.order.placed', {
      id: order.id,
      orderNumber: order.orderNumber,
      customerEntityId: order.customerEntityId,
      customerUserId: order.customerUserId,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
      grandTotalNetAmount: calculation.totals.grandTotalNetAmount,
      grandTotalGrossAmount: calculation.totals.grandTotalGrossAmount,
    }, {
      persistent: true,
      tenantId: order.tenantId,
      organizationId: order.organizationId,
    })

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      grandTotalNetAmount: calculation.totals.grandTotalNetAmount,
      grandTotalGrossAmount: calculation.totals.grandTotalGrossAmount,
    }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    return await loadOrderSnapshot(em, result.orderId)
  },
  buildLog: async ({ result, snapshots }) => {
    const snapshot = snapshots.after as OrderSnapshot | undefined
    return {
      actionLabel: 'Place Anter order',
      resourceKind: 'anter_orders.order',
      resourceId: result.orderId,
      tenantId: snapshot?.order.tenantId ?? null,
      organizationId: snapshot?.order.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        },
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ after?: OrderSnapshot }>(logEntry) ?? null
    const orderId = logEntry?.resourceId ?? payload?.after?.order.id ?? null
    if (!orderId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const order = await em.findOne(AnterOrder, { id: orderId })
    if (!order) return

    const lines = await em.find(AnterOrderLine, { orderId: order.id })
    const allocations = lines.length
      ? await em.find(AnterStockAllocation, { orderLineId: { $in: lines.map((line) => line.id) } })
      : []
    const identifiers = {
      id: order.id,
      organizationId: order.organizationId,
      tenantId: order.tenantId,
    }

    await withAtomicFlush(em, [
      () => {
        // §API Contracts undo column: "release allocations" — removed
        // outright (not merely `released`) since the order/lines are also
        // deleted, not archived.
        for (const allocation of allocations) em.remove(allocation)
      },
      () => {
        for (const line of lines) em.remove(line)
      },
      () => {
        em.remove(order)
      },
    ], { transaction: true, label: 'anter_orders.order.place.undo' })

    logger.info('Undid anter_orders.order.place', { orderId: identifiers.id })
  },
}

registerCommand(orderPlaceCommand)

export default orderPlaceCommand
