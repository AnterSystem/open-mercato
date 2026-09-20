import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterProjectRevision, AnterSubmission, AnterSubmissionEvent } from '../data/entities'
import { emitAnterConfiguratorEvent } from '../events'

const SUBMISSION_RESOURCE_KIND = 'anter_configurator.submission'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  submissionId: z.string().uuid(),
  actorUserId: z.string().uuid(),
})
type AcceptTechnicalInput = z.infer<typeof inputSchema>

type AcceptTechnicalResult = { submissionId: string; state: string }
type BeforeSnapshot = {
  submissionState: string
  revisionTechnicalAcceptanceState: string
  revisionTechnicalAcceptedByUserId: string | null
  revisionTechnicalAcceptedAt: string | null
} | null

function parseInput(rawInput: unknown): AcceptTechnicalInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.submission.accept_technical input', issues: result.error.issues })
  }
  return result.data
}

/**
 * First of the three technical-review decisions (spec §3.9, Implementation
 * Plan step 36; gated by `anter_configurator.review`, wired at the route).
 * Stamps the REVISION, not just the submission — that's what X10's mutation
 * guard reads to unblock `order.confirm` for the priced track, so acceptance
 * always closes the priced submission outright while the unpriced track
 * still has a value to put on it (`valuation`, Phase J).
 */
const submissionAcceptTechnicalCommand: CommandHandler<unknown, AcceptTechnicalResult> = {
  id: 'anter_configurator.submission.accept_technical',
  isUndoable: true,
  async prepare(rawInput, ctx): Promise<{ before?: BeforeSnapshot }> {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const submission = await em.findOne(AnterSubmission, { id: parsed.submissionId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!submission) return { before: null }
    const revision = await em.findOne(AnterProjectRevision, { id: submission.revisionId })
    return {
      before: {
        submissionState: submission.state,
        revisionTechnicalAcceptanceState: revision?.technicalAcceptanceState ?? 'none',
        revisionTechnicalAcceptedByUserId: revision?.technicalAcceptedByUserId ?? null,
        revisionTechnicalAcceptedAt: revision?.technicalAcceptedAt ? revision.technicalAcceptedAt.toISOString() : null,
      },
    }
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
    const revision = await em.findOne(AnterProjectRevision, { id: submission.revisionId })
    if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })

    const now = new Date()
    const nextState = submission.track === 'priced' ? 'closed_order' : 'valuation'

    await withAtomicFlush(em, [
      () => {
        revision.technicalAcceptanceState = 'accepted'
        revision.technicalAcceptedByUserId = parsed.actorUserId
        revision.technicalAcceptedAt = now
        submission.state = nextState
        if (nextState === 'closed_order') submission.closedAt = now
        em.persist(em.create(AnterSubmissionEvent, {
          id: randomUUID(),
          submissionId: submission.id,
          fromState: 'technical_review',
          toState: nextState,
          actorUserId: parsed.actorUserId,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        }))
      },
    ], { transaction: true, label: 'anter_configurator.submission.accept_technical' })

    await emitAnterConfiguratorEvent('anter_configurator.submission.technically_accepted', {
      submissionId: submission.id,
      revisionId: revision.id,
      projectId: submission.projectId,
      customerEntityId: submission.customerEntityId ?? null,
      track: submission.track,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
    }, { persistent: true, tenantId: parsed.tenantId, organizationId: parsed.organizationId })

    return { submissionId: submission.id, state: submission.state }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Accept Anter configurator submission technically',
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
    const revision = await em.findOne(AnterProjectRevision, { id: submission.revisionId })

    await withAtomicFlush(em, [
      () => {
        submission.state = payload.before!.submissionState
        submission.closedAt = null
        if (revision) {
          revision.technicalAcceptanceState = payload.before!.revisionTechnicalAcceptanceState
          revision.technicalAcceptedByUserId = payload.before!.revisionTechnicalAcceptedByUserId
          revision.technicalAcceptedAt = payload.before!.revisionTechnicalAcceptedAt ? new Date(payload.before!.revisionTechnicalAcceptedAt) : null
        }
      },
    ], { transaction: true, label: 'anter_configurator.submission.accept_technical.undo' })
  },
}

registerCommand(submissionAcceptTechnicalCommand)

export default submissionAcceptTechnicalCommand
