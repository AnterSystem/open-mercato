import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { emitAnterConfiguratorEvent } from '../events'
import { AnterOffer, AnterOfferLine, AnterProject } from '../data/entities'

const OFFER_RESOURCE_KIND = 'anter_configurator.offer'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  offerId: z.string().uuid(),
  customerUserId: z.string().uuid(),
  deliveryMode: z.enum(['partner_warehouse', 'end_customer', 'self_collection']),
  deliveryAddressSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  partnerReference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})
type OfferAcceptInput = z.infer<typeof inputSchema>

type OfferAcceptResult = { offerId: string; orderId: string; orderNumber: string; orderUndoToken: string | null }
type BeforeSnapshot = { status: string; acceptedAt: string | null } | null

function parseInput(rawInput: unknown): OfferAcceptInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.offer.accept input', issues: result.error.issues })
  }
  return result.data
}

/**
 * `anter_configurator.offer.accept` (spec §3.10, step 45's backend half).
 * Places the order at the offer's FROZEN prices via
 * `anter_orders.order.place` with `source: 'crm_offer'` (X9) — this is the
 * one placement path that must never re-price (§3.11's documented
 * asymmetry: "cart checkout re-prices, offer acceptance does not"). Undo
 * cancels the order through `anter_orders.order.place`'s own undo (its
 * registered undo token, captured here) and restores the offer to `issued`.
 */
const offerAcceptCommand: CommandHandler<unknown, OfferAcceptResult> = {
  id: 'anter_configurator.offer.accept',
  isUndoable: true,
  async prepare(rawInput, ctx): Promise<{ before?: BeforeSnapshot }> {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(AnterOffer, { id: parsed.offerId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!offer) return { before: null }
    return { before: { status: offer.status, acceptedAt: offer.acceptedAt ? offer.acceptedAt.toISOString() : null } }
  },
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(AnterOffer, { id: parsed.offerId, organizationId: parsed.organizationId, tenantId: parsed.tenantId, deletedAt: null })
    if (!offer) throw new CrudHttpError(404, { error: '[internal] offer not found' })
    if (offer.status === 'superseded') {
      // §3.8: manufacturing to a drawing the customer has already changed is
      // the expensive failure this refusal exists to prevent.
      const project = await em.findOne(AnterProject, { id: offer.projectId })
      throw new CrudHttpError(409, { error: 'revision_superseded', supersededByRevisionId: project?.currentRevisionId ?? null, currentOfferId: offer.id })
    }
    if (offer.status !== 'issued') {
      throw new CrudHttpError(409, { error: '[internal] only an issued offer can be accepted', status: offer.status })
    }
    if (new Date(offer.validUntil) < new Date()) {
      throw new CrudHttpError(409, { error: 'offer_expired' })
    }
    if (!offer.customerEntityId) {
      throw new CrudHttpError(422, { error: '[internal] offer is not bound to a partner' })
    }

    const lines = await em.find(AnterOfferLine, { offerId: offer.id }, { orderBy: { lineNumber: 'asc' } })
    if (lines.some((line) => line.isAwaitingValuation)) {
      throw new CrudHttpError(409, { error: 'offer_incomplete' })
    }

    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const orderPlaceCtx: CommandRuntimeContext = { ...ctx, request: undefined }
    const { result: orderResult, logEntry: orderLogEntry } = await commandBus.execute<unknown, { orderId: string; orderNumber: string }>('anter_orders.order.place', {
      input: {
        organizationId: parsed.organizationId,
        tenantId: parsed.tenantId,
        customerEntityId: offer.customerEntityId,
        customerUserId: parsed.customerUserId,
        currencyCode: offer.currencyCode,
        deliveryMode: parsed.deliveryMode,
        deliveryAddressSnapshot: parsed.deliveryAddressSnapshot ?? null,
        paymentTermsDays: 0,
        shippingNetAmount: Number(offer.shippingNetAmount),
        partnerReference: parsed.partnerReference ?? null,
        notes: parsed.notes ?? null,
        source: 'crm_offer',
        offerId: offer.id,
        lines: lines.map((line) => ({
          productId: line.productId,
          productVariantId: line.productVariantId ?? null,
          sku: line.sku ?? null,
          nameSnapshot: line.nameSnapshot,
          quantity: Number(line.quantity),
          unitCode: line.unitCode,
          listUnitPriceNet: line.listUnitPriceNet != null ? Number(line.listUnitPriceNet) : Number(line.unitPriceNet ?? 0),
          unitPriceNet: line.unitPriceNet != null ? Number(line.unitPriceNet) : 0,
          taxRate: Number(line.taxRate),
        })),
      },
      ctx: orderPlaceCtx,
    })

    const acceptedAt = new Date()
    await withAtomicFlush(em, [
      () => {
        offer.status = 'accepted'
        offer.acceptedAt = acceptedAt
      },
    ], { transaction: true, label: 'anter_configurator.offer.accept' })

    await emitAnterConfiguratorEvent('anter_configurator.offer.accepted', {
      offerId: offer.id,
      orderId: orderResult.orderId,
      orderNumber: orderResult.orderNumber,
      projectId: offer.projectId,
      revisionId: offer.revisionId,
      customerEntityId: offer.customerEntityId,
      customerDealId: offer.customerDealId ?? null,
      grandTotalNetAmount: Number(offer.grandTotalNetAmount),
      grandTotalGrossAmount: Number(offer.grandTotalGrossAmount),
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
    }, { persistent: true, tenantId: parsed.tenantId, organizationId: parsed.organizationId })

    return { offerId: offer.id, orderId: orderResult.orderId, orderNumber: orderResult.orderNumber, orderUndoToken: orderLogEntry?.undoToken ?? null }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Accept Anter configurator offer',
    resourceKind: OFFER_RESOURCE_KIND,
    resourceId: result.offerId,
    payload: {
      undo: {
        before: snapshots.before,
        after: { orderId: result.orderId, orderUndoToken: result.orderUndoToken },
      },
    },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: BeforeSnapshot; after: { orderId: string; orderUndoToken: string | null } }>(logEntry)
    const offerId = logEntry?.resourceId ?? null
    if (!offerId || !payload?.before) return

    if (payload.after?.orderUndoToken) {
      const commandBus = ctx.container.resolve<CommandBus>('commandBus')
      await commandBus.undo(payload.after.orderUndoToken, { ...ctx, request: undefined })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(AnterOffer, { id: offerId })
    if (!offer) return

    await withAtomicFlush(em, [
      () => {
        offer.status = payload.before!.status
        offer.acceptedAt = payload.before!.acceptedAt ? new Date(payload.before!.acceptedAt) : null
      },
    ], { transaction: true, label: 'anter_configurator.offer.accept.undo' })
  },
}

registerCommand(offerAcceptCommand)

export default offerAcceptCommand
