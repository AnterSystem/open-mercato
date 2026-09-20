import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterSubmission, AnterSubmissionEvent } from '../data/entities'
import { emitAnterConfiguratorEvent } from '../events'

const SUBMISSION_RESOURCE_KIND = 'anter_configurator.submission'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  submissionId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
})
type RequestChangesInput = z.infer<typeof inputSchema>

type RequestChangesResult = { submissionId: string; state: string }
type BeforeSnapshot = { state: string } | null

function parseInput(rawInput: unknown): RequestChangesInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.submission.request_changes input', issues: result.error.issues })
  }
  return result.data
}

/**
 * Second technical-review decision (spec §3.9, step 36). Does NOT touch the
 * revision — the submitted revision stays immutable (§3.8); the partner's
 * only path forward is `revision.branch`, which is what runs the
 * supersession cascade this submission's own `revision_requested` state
 * anticipates.
 */
const submissionRequestChangesCommand: CommandHandler<unknown, RequestChangesResult> = {
  id: 'anter_configurator.submission.request_changes',
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
        submission.state = 'revision_requested'
        submission.closedAt = new Date()
        em.persist(em.create(AnterSubmissionEvent, {
          id: randomUUID(),
          submissionId: submission.id,
          fromState: 'technical_review',
          toState: 'revision_requested',
          actorUserId: parsed.actorUserId,
          reason: parsed.reason,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        }))
      },
    ], { transaction: true, label: 'anter_configurator.submission.request_changes' })

    await emitAnterConfiguratorEvent('anter_configurator.submission.changes_requested', {
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
    actionLabel: 'Request changes on Anter configurator submission',
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
    ], { transaction: true, label: 'anter_configurator.submission.request_changes.undo' })
  },
}

registerCommand(submissionRequestChangesCommand)

export default submissionRequestChangesCommand
