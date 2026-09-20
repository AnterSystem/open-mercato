import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { emitAnterConfiguratorEvent } from '../events'
import { AnterOffer } from '../data/entities'
import type { AnterOfferNumberService } from '../services/anterOfferNumberService'

const OFFER_RESOURCE_KIND = 'anter_configurator.offer'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  offerId: z.string().uuid(),
  actorUserId: z.string().uuid(),
})
type OfferIssueInput = z.infer<typeof inputSchema>

type OfferIssueResult = { offerId: string; offerNumber: string; status: string; issuedAt: string }
type BeforeSnapshot = { status: string; issuedAt: string | null } | null

function parseInput(rawInput: unknown): OfferIssueInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.offer.issue input', issues: result.error.issues })
  }
  return result.data
}

/**
 * `anter_configurator.offer.issue` (spec §3.10/CC-4, step 43). Assigns
 * `offer_number` exactly once — undo reverts `status`/`issued_at` but
 * deliberately never clears the number (§API Contracts "Irreversible
 * effects": "a number that has been on a document sent to a customer is
 * spent"). Document rendering (the generated PDF, `document_attachment_id`)
 * is out of scope for this pass — recorded as a known gap, not silently
 * dropped; `documentAttachmentId` stays null until that lands.
 */
const offerIssueCommand: CommandHandler<unknown, OfferIssueResult> = {
  id: 'anter_configurator.offer.issue',
  isUndoable: true,
  async prepare(rawInput, ctx): Promise<{ before?: BeforeSnapshot }> {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(AnterOffer, { id: parsed.offerId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!offer) return { before: null }
    return { before: { status: offer.status, issuedAt: offer.issuedAt ? offer.issuedAt.toISOString() : null } }
  },
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(AnterOffer, { id: parsed.offerId, organizationId: parsed.organizationId, tenantId: parsed.tenantId, deletedAt: null })
    if (!offer) throw new CrudHttpError(404, { error: '[internal] offer not found' })
    if (offer.status !== 'draft') {
      throw new CrudHttpError(409, { error: '[internal] only a draft offer can be issued', status: offer.status })
    }

    const numberService = ctx.container.resolve<AnterOfferNumberService>('anterOfferNumberService')
    const offerNumber = offer.offerNumber ?? await numberService.generate({ organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    const issuedAt = new Date()

    await withAtomicFlush(em, [
      () => {
        offer.offerNumber = offerNumber
        offer.status = 'issued'
        offer.issuedAt = issuedAt
      },
    ], { transaction: true, label: 'anter_configurator.offer.issue' })

    await emitAnterConfiguratorEvent('anter_configurator.offer.issued', {
      offerId: offer.id,
      offerNumber,
      projectId: offer.projectId,
      revisionId: offer.revisionId,
      customerEntityId: offer.customerEntityId ?? null,
      customerDealId: offer.customerDealId ?? null,
      grandTotalNetAmount: Number(offer.grandTotalNetAmount),
      grandTotalGrossAmount: Number(offer.grandTotalGrossAmount),
      validUntil: offer.validUntil,
      isIncomplete: offer.isIncomplete,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
    }, { persistent: true, tenantId: parsed.tenantId, organizationId: parsed.organizationId })

    return { offerId: offer.id, offerNumber, status: offer.status, issuedAt: issuedAt.toISOString() }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Issue Anter configurator offer',
    resourceKind: OFFER_RESOURCE_KIND,
    resourceId: result.offerId,
    payload: { undo: { before: snapshots.before } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: BeforeSnapshot }>(logEntry)
    const offerId = logEntry?.resourceId ?? null
    if (!offerId || !payload?.before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(AnterOffer, { id: offerId })
    if (!offer) return

    await withAtomicFlush(em, [
      () => {
        offer.status = payload.before!.status
        offer.issuedAt = payload.before!.issuedAt ? new Date(payload.before!.issuedAt) : null
        // offerNumber intentionally left untouched — never released once issued.
      },
    ], { transaction: true, label: 'anter_configurator.offer.issue.undo' })
  },
}

registerCommand(offerIssueCommand)

export default offerIssueCommand
