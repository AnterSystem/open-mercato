import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { SalesLineSnapshot } from '@open-mercato/core/modules/sales/lib/types'
import { AnterBomLine, AnterCustomItem, AnterOffer, AnterOfferLine, AnterProject, AnterProjectRevision } from '../data/entities'
import { resolveAnterConfiguratorCalculationService } from '../lib/calculationService'

const OFFER_RESOURCE_KIND = 'anter_configurator.offer'
const DEFAULT_VALID_DAYS = 30

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  revisionId: z.string().uuid(),
  submissionId: z.string().uuid().nullable().optional(),
  validUntilDays: z.coerce.number().int().min(1).default(DEFAULT_VALID_DAYS),
  shippingNetAmount: z.coerce.number().min(0).default(0),
  deliveryTerms: z.string().trim().max(2000).nullable().optional(),
  paymentTermsText: z.string().trim().max(2000).nullable().optional(),
  leadTimeText: z.string().trim().max(2000).nullable().optional(),
})
type OfferBuildInput = z.infer<typeof inputSchema>

type OfferBuildResult = {
  offerId: string
  status: string
  isIncomplete: boolean
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
}

function parseInput(rawInput: unknown): OfferBuildInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.offer.build input', issues: result.error.issues })
  }
  return result.data
}

const SHIPPING_LINE_NAME = 'Shipping'

/**
 * `anter_configurator.offer.build` (spec §3.10/§API Contracts, step 42).
 * Creates a `draft` offer with NO number yet (CC-4 — assigned only at
 * `offer.issue`). Totals go through `salesCalculationService` on
 * `SalesLineSnapshot`s (§3.11's "one arithmetic") — every priced BOM line and
 * priced custom item enters the calculation; anything still awaiting
 * valuation is excluded from it and copied as its own line with
 * `is_awaiting_valuation: true` and no price, which is what sets
 * `is_incomplete` (§3.6, §3.10).
 */
const offerBuildCommand: CommandHandler<unknown, OfferBuildResult> = {
  id: 'anter_configurator.offer.build',
  isUndoable: true,
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const scope = { organizationId: parsed.organizationId, tenantId: parsed.tenantId }

    const revision = await em.findOne(AnterProjectRevision, { id: parsed.revisionId, ...scope, deletedAt: null })
    if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })
    const project = await em.findOne(AnterProject, { id: revision.projectId, ...scope, deletedAt: null })
    if (!project) throw new CrudHttpError(404, { error: '[internal] project not found' })

    const [bomLines, customItems] = await Promise.all([
      em.find(AnterBomLine, { revisionId: revision.id }),
      em.find(AnterCustomItem, { revisionId: revision.id, deletedAt: null }),
    ])

    const currencyCode = revision.bomCurrencyCode ?? 'PLN'
    const calculationService = resolveAnterConfiguratorCalculationService(ctx)

    type LineDraft = {
      bomLineId: string | null
      customItemId: string | null
      productId: string | null
      productVariantId: string | null
      sku: string | null
      nameSnapshot: string
      quantity: number
      unitCode: string
      listUnitPriceNet: number | null
      unitPriceNet: number | null
      taxRate: number
      isAwaitingValuation: boolean
    }

    const drafts: LineDraft[] = []
    for (const line of bomLines) {
      const awaiting = line.priceState !== 'priced'
      drafts.push({
        bomLineId: line.id,
        customItemId: null,
        productId: line.productId,
        productVariantId: line.productVariantId ?? null,
        sku: line.sku ?? null,
        nameSnapshot: line.nameSnapshot,
        quantity: Number(line.quantity),
        unitCode: line.unitCode,
        listUnitPriceNet: line.listUnitPriceNet != null ? Number(line.listUnitPriceNet) : null,
        unitPriceNet: awaiting ? null : (line.partnerUnitPriceNet != null ? Number(line.partnerUnitPriceNet) : null),
        taxRate: 0,
        isAwaitingValuation: awaiting,
      })
    }
    for (const item of customItems) {
      const awaiting = item.valuationState !== 'priced'
      drafts.push({
        bomLineId: null,
        customItemId: item.id,
        productId: null,
        productVariantId: null,
        sku: null,
        nameSnapshot: item.description,
        quantity: Number(item.quantity),
        unitCode: item.unitCode,
        listUnitPriceNet: null,
        unitPriceNet: awaiting ? null : (item.unitPriceNet != null ? Number(item.unitPriceNet) : null),
        taxRate: 0,
        isAwaitingValuation: awaiting,
      })
    }

    const pricedDrafts = drafts.filter((draft) => !draft.isAwaitingValuation)
    const productLines: SalesLineSnapshot[] = pricedDrafts.map((draft) => ({
      kind: 'product',
      productId: draft.productId,
      productVariantId: draft.productVariantId,
      name: draft.nameSnapshot,
      quantity: draft.quantity,
      currencyCode,
      unitPriceNet: draft.unitPriceNet ?? 0,
      taxRate: draft.taxRate,
    }))
    const shippingLine: SalesLineSnapshot | null = parsed.shippingNetAmount > 0 ? {
      kind: 'shipping',
      name: SHIPPING_LINE_NAME,
      quantity: 1,
      currencyCode,
      unitPriceNet: parsed.shippingNetAmount,
      taxRate: 0,
    } : null

    const calculation = await calculationService.calculateDocumentTotals({
      documentKind: 'order',
      lines: shippingLine ? [...productLines, shippingLine] : productLines,
      context: { tenantId: parsed.tenantId, organizationId: parsed.organizationId, currencyCode },
    })

    const isIncomplete = drafts.some((draft) => draft.isAwaitingValuation)
    const now = new Date()
    const validUntil = new Date(now.getTime() + parsed.validUntilDays * 24 * 60 * 60 * 1000)
    const offerId = randomUUID()

    await withAtomicFlush(em, [
      () => {
        em.create(AnterOffer, {
          id: offerId,
          submissionId: parsed.submissionId ?? null,
          projectId: project.id,
          revisionId: revision.id,
          customerEntityId: project.customerEntityId ?? null,
          customerDealId: project.customerDealId ?? null,
          status: 'draft',
          currencyCode,
          validUntil: validUntil.toISOString().slice(0, 10),
          isIncomplete,
          incompleteReason: isIncomplete ? '[internal] one or more positions are still awaiting valuation' : null,
          subtotalNetAmount: String(calculation.totals.subtotalNetAmount),
          discountTotalAmount: String(calculation.totals.discountTotalAmount ?? 0),
          shippingNetAmount: String(calculation.totals.shippingNetAmount ?? parsed.shippingNetAmount),
          taxTotalAmount: String(calculation.totals.taxTotalAmount ?? 0),
          grandTotalNetAmount: String(calculation.totals.grandTotalNetAmount),
          grandTotalGrossAmount: String(calculation.totals.grandTotalGrossAmount),
          deliveryTerms: parsed.deliveryTerms ?? null,
          paymentTermsText: parsed.paymentTermsText ?? null,
          leadTimeText: parsed.leadTimeText ?? null,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        })

        let pricedIndex = 0
        drafts.forEach((draft, index) => {
          const calculatedLine = draft.isAwaitingValuation ? null : calculation.lines[pricedIndex]
          if (!draft.isAwaitingValuation) pricedIndex += 1
          em.create(AnterOfferLine, {
            id: randomUUID(),
            offerId,
            lineNumber: index + 1,
            bomLineId: draft.bomLineId,
            customItemId: draft.customItemId,
            productId: draft.productId,
            productVariantId: draft.productVariantId,
            sku: draft.sku,
            nameSnapshot: draft.nameSnapshot,
            quantity: String(draft.quantity),
            unitCode: draft.unitCode,
            listUnitPriceNet: draft.listUnitPriceNet != null ? String(draft.listUnitPriceNet) : null,
            unitPriceNet: draft.unitPriceNet != null ? String(draft.unitPriceNet) : null,
            discountAmount: String(calculatedLine?.discountAmount ?? 0),
            taxRate: String(draft.taxRate),
            netAmount: calculatedLine ? String(calculatedLine.netAmount) : null,
            grossAmount: calculatedLine ? String(calculatedLine.grossAmount) : null,
            isAwaitingValuation: draft.isAwaitingValuation,
            organizationId: parsed.organizationId,
            tenantId: parsed.tenantId,
          })
        })
      },
    ], { transaction: true, label: 'anter_configurator.offer.build' })

    return {
      offerId,
      status: 'draft',
      isIncomplete,
      grandTotalNetAmount: calculation.totals.grandTotalNetAmount,
      grandTotalGrossAmount: calculation.totals.grandTotalGrossAmount,
    }
  },
  buildLog: async ({ result }) => ({
    actionLabel: 'Build Anter configurator offer',
    resourceKind: OFFER_RESOURCE_KIND,
    resourceId: result.offerId,
    payload: { undo: { after: result } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ after: OfferBuildResult }>(logEntry)
    const offerId = logEntry?.resourceId ?? payload?.after?.offerId ?? null
    if (!offerId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(AnterOffer, { id: offerId })
    if (!offer || offer.status !== 'draft') return
    const lines = await em.find(AnterOfferLine, { offerId: offer.id })

    await withAtomicFlush(em, [
      () => {
        for (const line of lines) em.remove(line)
      },
      () => {
        em.remove(offer)
      },
    ], { transaction: true, label: 'anter_configurator.offer.build.undo' })
  },
}

registerCommand(offerBuildCommand)

export default offerBuildCommand
