import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterProjectElement, AnterProjectRevision, AnterSubmission } from '../data/entities'
import type { AnterSubmissionNumberService } from '../services/anterSubmissionNumberService'

const SUBMISSION_RESOURCE_KIND = 'anter_configurator.submission'
const DEFAULT_DUE_DAYS = 2

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  revisionId: z.string().uuid(),
  customerEntityId: z.string().uuid().nullable().optional(),
  track: z.enum(['priced', 'unpriced']),
})
type SubmissionCreateInput = z.infer<typeof inputSchema>

type SubmissionCreateResult = { submissionId: string; submissionNumber: string; track: string; dueAt: string }

function parseInput(rawInput: unknown): SubmissionCreateInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.submission.create input', issues: result.error.issues })
  }
  return result.data
}

/**
 * `anter_configurator.submission.create` (spec §API Contracts, Implementation
 * Plan step 32; this Phase H slice only handles the unpriced quote-request
 * path — the queue, assignment and the three decisions are Phase I). Opens a
 * submission on a revision and marks the revision `submitted` — a submitted
 * revision is immutable (§3.8), so every element/calibration route refuses
 * further edits from this point until a new revision is branched.
 */
const submissionCreateCommand: CommandHandler<unknown, SubmissionCreateResult> = {
  id: 'anter_configurator.submission.create',
  isUndoable: true,
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const revision = await em.findOne(AnterProjectRevision, { id: parsed.revisionId, organizationId: parsed.organizationId, tenantId: parsed.tenantId, deletedAt: null })
    if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })
    if (revision.state !== 'draft') {
      throw new CrudHttpError(409, { error: 'revision_locked', reason: 'already_submitted' })
    }

    const numberService = ctx.container.resolve<AnterSubmissionNumberService>('anterSubmissionNumberService')
    const submissionNumber = await numberService.generate({ organizationId: parsed.organizationId, tenantId: parsed.tenantId })

    const drawnElementCount = await em.count(AnterProjectElement, { revisionId: revision.id, elementKind: { $ne: 'annotation' } })

    const now = new Date()
    const dueAt = new Date(now.getTime() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000)
    const submissionId = randomUUID()

    await withAtomicFlush(em, [
      () => {
        em.create(AnterSubmission, {
          id: submissionId,
          submissionNumber,
          projectId: parsed.projectId,
          revisionId: revision.id,
          customerEntityId: parsed.customerEntityId ?? null,
          track: parsed.track,
          state: 'technical_review',
          dueAt,
          submittedAt: now,
          positionCount: drawnElementCount,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        })
        revision.state = 'submitted'
      },
    ], { transaction: true, label: 'anter_configurator.submission.create' })

    return { submissionId, submissionNumber, track: parsed.track, dueAt: dueAt.toISOString() }
  },
  buildLog: async ({ result }) => ({
    actionLabel: 'Create Anter configurator submission',
    resourceKind: SUBMISSION_RESOURCE_KIND,
    resourceId: result.submissionId,
    payload: { undo: { after: result } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ after: SubmissionCreateResult }>(logEntry)
    const submissionId = logEntry?.resourceId ?? payload?.after?.submissionId ?? null
    if (!submissionId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const submission = await em.findOne(AnterSubmission, { id: submissionId })
    if (!submission) return
    const revision = await em.findOne(AnterProjectRevision, { id: submission.revisionId })

    await withAtomicFlush(em, [
      () => {
        em.remove(submission)
        if (revision) revision.state = 'draft'
      },
    ], { transaction: true, label: 'anter_configurator.submission.create.undo' })
  },
}

registerCommand(submissionCreateCommand)

export default submissionCreateCommand
