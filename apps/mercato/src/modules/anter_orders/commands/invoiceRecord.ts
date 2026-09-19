import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { AnterInvoice, AnterOrder } from '../data/entities'

const logger = createLogger('anter_orders').child({ component: 'commands.invoiceRecord' })

const ORDER_RESOURCE_KIND = 'anter_orders.order'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1).max(64),
  issuedAt: z.coerce.date(),
  netAmount: z.coerce.number().min(0),
  grossAmount: z.coerce.number().min(0),
  attachmentId: z.string().uuid().nullable().optional(),
})
type InvoiceRecordInput = z.infer<typeof inputSchema>

type InvoiceRecordResult = { invoiceId: string; orderId: string }

function parseInput(rawInput: unknown): InvoiceRecordInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_orders.invoice.record input', issues: result.error.issues })
  }
  return result.data
}

/**
 * Soft-optionally verifies the attachment exists (module-absent behaviour,
 * spec Implementation Plan step 16: `attachments` disabled → this check is
 * skipped, the FK-id is stored as-is, and document columns render "—"
 * wherever they're read — never a hard dependency on the module existing).
 */
async function assertAttachmentExists(ctx: CommandRuntimeContext, attachmentId: string): Promise<void> {
  try {
    const attachmentService = ctx.container.resolve<{ findById?: (id: string) => Promise<unknown> }>('attachmentService')
    if (typeof attachmentService?.findById !== 'function') return
    const attachment = await attachmentService.findById(attachmentId)
    if (!attachment) {
      throw new CrudHttpError(422, { error: '[internal] attachment not found — invoice not created' })
    }
  } catch (err) {
    if (err instanceof CrudHttpError) throw err
    logger.debug('[internal] attachmentService unavailable, skipping attachment existence check')
  }
}

/**
 * D8: records an invoice's number, date and amounts, with an optional
 * attachment. Recording the number and the file is ONE operation (spec
 * §Edge Cases "a numbered invoice with no document is worse than no row") —
 * `assertAttachmentExists` runs before the row is created, so a bad/missing
 * attachment id fails the whole command rather than leaving a numbered row
 * with a dead link.
 */
const invoiceRecordCommand: CommandHandler<unknown, InvoiceRecordResult> = {
  id: 'anter_orders.invoice.record',
  isUndoable: true,
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const order = await em.findOne(AnterOrder, { id: parsed.orderId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!order) throw new CrudHttpError(404, { error: '[internal] order not found' })

    if (parsed.attachmentId) await assertAttachmentExists(ctx, parsed.attachmentId)

    const invoiceId = randomUUID()
    await withAtomicFlush(em, [
      () => {
        em.create(AnterInvoice, {
          id: invoiceId,
          orderId: order.id,
          invoiceNumber: parsed.invoiceNumber,
          issuedAt: parsed.issuedAt,
          netAmount: String(parsed.netAmount),
          grossAmount: String(parsed.grossAmount),
          currencyCode: order.currencyCode,
          attachmentId: parsed.attachmentId ?? null,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        })
      },
    ], { transaction: true, label: 'anter_orders.invoice.record' })

    return { invoiceId, orderId: order.id }
  },
  buildLog: async ({ result }) => ({
    actionLabel: 'Record Anter invoice',
    resourceKind: ORDER_RESOURCE_KIND,
    resourceId: result.invoiceId,
    payload: { undo: { invoiceId: result.invoiceId } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ invoiceId: string }>(logEntry)
    const invoiceId = payload?.invoiceId ?? logEntry?.resourceId ?? null
    if (!invoiceId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const invoice = await em.findOne(AnterInvoice, { id: invoiceId })
    if (!invoice) return

    // §API Contracts undo column: "Delete invoice row (the file stays in
    // attachments)" — never delete the attachment itself.
    await withAtomicFlush(em, [() => { em.remove(invoice) }], { transaction: true, label: 'anter_orders.invoice.record.undo' })
  },
}

registerCommand(invoiceRecordCommand)

export default invoiceRecordCommand
