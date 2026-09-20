import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterSubmission, AnterSubmissionComment } from '../data/entities'

const COMMENT_RESOURCE_KIND = 'anter_configurator.submission_comment'

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  submissionId: z.string().uuid(),
  elementId: z.string().uuid().nullable().optional(),
  authorUserId: z.string().uuid().nullable().optional(),
  authorCustomerUserId: z.string().uuid().nullable().optional(),
  body: z.string().trim().min(1).max(4000),
  visibility: z.enum(['shared', 'internal']).default('shared'),
})
type CommentAddInput = z.infer<typeof inputSchema>

type CommentAddResult = { commentId: string }

function parseInput(rawInput: unknown): CommentAddInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.submission.comment_add input', issues: result.error.issues })
  }
  return result.data
}

/**
 * `anter_configurator.submission.comment_add` (spec §3.8's "element-anchored
 * comments", step 35). A portal caller is refused `visibility: 'internal'`
 * at the route (never here — the command trusts its input, per pattern).
 */
const submissionCommentAddCommand: CommandHandler<unknown, CommentAddResult> = {
  id: 'anter_configurator.submission.comment_add',
  isUndoable: true,
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const submission = await em.findOne(AnterSubmission, { id: parsed.submissionId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!submission) throw new CrudHttpError(404, { error: '[internal] submission not found' })

    const commentId = randomUUID()
    await withAtomicFlush(em, [
      () => {
        em.create(AnterSubmissionComment, {
          id: commentId,
          submissionId: submission.id,
          elementId: parsed.elementId ?? null,
          authorUserId: parsed.authorUserId ?? null,
          authorCustomerUserId: parsed.authorCustomerUserId ?? null,
          body: parsed.body,
          visibility: parsed.visibility,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        })
      },
    ], { transaction: true, label: 'anter_configurator.submission.comment_add' })

    return { commentId }
  },
  buildLog: async ({ result }) => ({
    actionLabel: 'Add Anter configurator submission comment',
    resourceKind: COMMENT_RESOURCE_KIND,
    resourceId: result.commentId,
    payload: { undo: { after: result } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ after: CommentAddResult }>(logEntry)
    const commentId = logEntry?.resourceId ?? payload?.after?.commentId ?? null
    if (!commentId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const comment = await em.findOne(AnterSubmissionComment, { id: commentId })
    if (!comment) return

    await withAtomicFlush(em, [
      () => { em.remove(comment) },
    ], { transaction: true, label: 'anter_configurator.submission.comment_add.undo' })
  },
}

registerCommand(submissionCommentAddCommand)

export default submissionCommentAddCommand
