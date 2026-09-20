import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { AnterSubmission, AnterSubmissionEvent } from '../data/entities'
import { emitAnterConfiguratorEvent } from '../events'

const logger = createLogger('anter_configurator').child({ component: 'commands.submissionReject' })

const SUBMISSION_RESOURCE_KIND = 'anter_configurator.submission'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  submissionId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
})
type RejectInput = z.infer<typeof inputSchema>

type RejectResult = { submissionId: string; state: string }
type BeforeSnapshot = { state: string } | null

function parseInput(rawInput: unknown): RejectInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.submission.reject input', issues: result.error.issues })
  }
  return result.data
}

/**
 * Third technical-review decision (spec §3.9/A-29, step 36). For the priced
 * track this fires AFTER the order already exists (`order.place` never waits
 * on review, C9) — rejection therefore also calls into `anter_orders` (the
 * allowed direction, §3.2) to move that order to `technical_hold` (X8), a
 * status distinct from every stock/payment status the order module already
 * has, so staff can tell why this one order stalled.
 */
const submissionRejectCommand: CommandHandler<unknown, RejectResult> = {
  id: 'anter_configurator.submission.reject',
  isUndoable: true,
  async prepare(rawInput, ctx): Promise<{ before?: BeforeSnapshot }> {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const submission = await em.findOne(AnterSubmission, { id: parsed.submissionId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!submission) return { before: null }
    return { before: { state: submission.state } }
  },
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const submission = await em.findOne(AnterSubmission, { id: parsed.submissionId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!submission) throw new CrudHttpError(404, { error: '[internal] submission not found' })
    if (submission.state !== 'technical_review') {
      throw new CrudHttpError(409, { error: '[internal] submission is not awaiting technical review', state: submission.state })
    }

    await withAtomicFlush(em, [
      () => {
        submission.state = 'rejected'
        submission.closedAt = new Date()
        em.persist(em.create(AnterSubmissionEvent, {
          id: randomUUID(),
          submissionId: submission.id,
          fromState: 'technical_review',
          toState: 'rejected',
          actorUserId: parsed.actorUserId,
          reason: parsed.reason,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        }))
      },
    ], { transaction: true, label: 'anter_configurator.submission.reject' })

    if (submission.track === 'priced' && submission.resultingOrderId) {
      try {
        const commandBus = ctx.container.resolve<CommandBus>('commandBus')
        const holdCtx: CommandRuntimeContext = {
          ...ctx,
          request: undefined,
        }
        await commandBus.execute('anter_orders.order.set_technical_hold', {
          input: {
            organizationId: parsed.organizationId,
            tenantId: parsed.tenantId,
            orderId: submission.resultingOrderId,
            reason: `[internal] technical review rejected: ${parsed.reason}`,
          },
          ctx: holdCtx,
        })
      } catch (err) {
        // The submission stands rejected regardless — a failed order-hold
        // write must never roll that back; staff sees the mismatch in the
        // order's own status and can hold it manually.
        logger.warn('[internal] failed to put the resulting order on technical hold after rejection', { submissionId: submission.id, orderId: submission.resultingOrderId, err })
      }
    }

    await emitAnterConfiguratorEvent('anter_configurator.submission.rejected', {
      submissionId: submission.id,
      revisionId: submission.revisionId,
      projectId: submission.projectId,
      customerEntityId: submission.customerEntityId ?? null,
      reason: parsed.reason,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
    }, { persistent: true, tenantId: parsed.tenantId, organizationId: parsed.organizationId })

    return { submissionId: submission.id, state: submission.state }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Reject Anter configurator submission',
    resourceKind: SUBMISSION_RESOURCE_KIND,
    resourceId: result.submissionId,
    payload: { undo: { before: snapshots.before } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: BeforeSnapshot }>(logEntry)
    const submissionId = logEntry?.resourceId ?? null
    if (!submissionId || !payload?.before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const submission = await em.findOne(AnterSubmission, { id: submissionId })
    if (!submission) return

    await withAtomicFlush(em, [
      () => {
        submission.state = payload.before!.state
        submission.closedAt = null
      },
    ], { transaction: true, label: 'anter_configurator.submission.reject.undo' })
  },
}

registerCommand(submissionRejectCommand)

export default submissionRejectCommand
