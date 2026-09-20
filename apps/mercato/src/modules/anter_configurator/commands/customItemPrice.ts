import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { emitAnterConfiguratorEvent } from '../events'
import { AnterBomLine, AnterCustomItem, AnterProjectRevision } from '../data/entities'

const CUSTOM_ITEM_RESOURCE_KIND = 'anter_configurator.custom_item'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  customItemId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  unitPriceNet: z.coerce.number().min(0),
})
type CustomItemPriceInput = z.infer<typeof inputSchema>

type CustomItemPriceResult = { customItemId: string; unitPriceNet: number; revisionHasUnpricedItems: boolean }
type BeforeSnapshot = {
  valuationState: string
  unitPriceNet: string | null
  pricedByUserId: string | null
  pricedAt: string | null
  revisionHasUnpricedItems: boolean
} | null

function parseInput(rawInput: unknown): CustomItemPriceInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.custom_item.price input', issues: result.error.issues })
  }
  return result.data
}

/**
 * `anter_configurator.custom_item.price` (spec §3.6/§API Contracts, step 41).
 * Prices one CC-5 position by hand and clears the revision's
 * `has_unpriced_items` flag ONLY when this was the last unpriced thing on it
 * (another `to_quote` BOM line or `awaiting` custom item can still be
 * outstanding) — the flag is a summary, so clearing it early would let an
 * offer built right after report itself complete when it is not.
 */
const customItemPriceCommand: CommandHandler<unknown, CustomItemPriceResult> = {
  id: 'anter_configurator.custom_item.price',
  isUndoable: true,
  async prepare(rawInput, ctx): Promise<{ before?: BeforeSnapshot }> {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const item = await em.findOne(AnterCustomItem, { id: parsed.customItemId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!item) return { before: null }
    const revision = await em.findOne(AnterProjectRevision, { id: item.revisionId })
    return {
      before: {
        valuationState: item.valuationState,
        unitPriceNet: item.unitPriceNet ?? null,
        pricedByUserId: item.pricedByUserId ?? null,
        pricedAt: item.pricedAt ? item.pricedAt.toISOString() : null,
        revisionHasUnpricedItems: revision?.hasUnpricedItems ?? false,
      },
    }
  },
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const item = await em.findOne(AnterCustomItem, { id: parsed.customItemId, organizationId: parsed.organizationId, tenantId: parsed.tenantId, deletedAt: null })
    if (!item) throw new CrudHttpError(404, { error: '[internal] custom item not found' })

    enforceCommandOptimisticLock({ resourceKind: CUSTOM_ITEM_RESOURCE_KIND, resourceId: item.id, current: item.updatedAt, request: ctx.request })

    const revision = await em.findOne(AnterProjectRevision, { id: item.revisionId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })

    const now = new Date()
    let revisionHasUnpricedItems = revision.hasUnpricedItems

    await withAtomicFlush(em, [
      async () => {
        item.valuationState = 'priced'
        item.unitPriceNet = String(parsed.unitPriceNet)
        item.pricedByUserId = parsed.actorUserId
        item.pricedAt = now

        const remainingAwaiting = await em.count(AnterCustomItem, {
          revisionId: revision.id,
          valuationState: 'awaiting',
          deletedAt: null,
          id: { $ne: item.id },
        })
        if (remainingAwaiting === 0) {
          const toQuoteLineCount = await em.count(AnterBomLine, { revisionId: revision.id, priceState: 'to_quote' })
          if (toQuoteLineCount === 0) {
            revision.hasUnpricedItems = false
            revisionHasUnpricedItems = false
          }
        }
      },
    ], { transaction: true, label: 'anter_configurator.custom_item.price' })

    await emitAnterConfiguratorEvent('anter_configurator.custom_item.priced', {
      customItemId: item.id,
      revisionId: item.revisionId,
      unitPriceNet: parsed.unitPriceNet,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
    }, { persistent: true, tenantId: parsed.tenantId, organizationId: parsed.organizationId })

    return { customItemId: item.id, unitPriceNet: parsed.unitPriceNet, revisionHasUnpricedItems }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Price Anter configurator custom item',
    resourceKind: CUSTOM_ITEM_RESOURCE_KIND,
    resourceId: result.customItemId,
    payload: { undo: { before: snapshots.before } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: BeforeSnapshot }>(logEntry)
    const customItemId = logEntry?.resourceId ?? null
    if (!customItemId || !payload?.before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const item = await em.findOne(AnterCustomItem, { id: customItemId })
    if (!item) return
    const revision = await em.findOne(AnterProjectRevision, { id: item.revisionId })

    await withAtomicFlush(em, [
      () => {
        item.valuationState = payload.before!.valuationState
        item.unitPriceNet = payload.before!.unitPriceNet
        item.pricedByUserId = payload.before!.pricedByUserId
        item.pricedAt = payload.before!.pricedAt ? new Date(payload.before!.pricedAt) : null
        if (revision) revision.hasUnpricedItems = payload.before!.revisionHasUnpricedItems
      },
    ], { transaction: true, label: 'anter_configurator.custom_item.price.undo' })
  },
}

registerCommand(customItemPriceCommand)

export default customItemPriceCommand
