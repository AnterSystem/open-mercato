import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  AnterPlanPoint,
  AnterProject,
  AnterProjectElement,
  AnterProjectRevision,
  AnterSubmission,
  AnterSubmissionEvent,
} from '../data/entities'

const REVISION_RESOURCE_KIND = 'anter_configurator.revision'
const OPEN_SUBMISSION_STATES = ['technical_review', 'valuation']

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  revisionId: z.string().uuid(),
})
type RevisionBranchInput = z.infer<typeof inputSchema>

type RevisionBranchResult = { revisionId: string; revisionLabel: string; projectId: string }

function parseInput(rawInput: unknown): RevisionBranchInput {
  const result = inputSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.revision.branch input', issues: result.error.issues })
  }
  return result.data
}

// "A" → "B" → … → "Z" → "AA" (branching this many times in one project is
// not a realistic path, but the fallback keeps the label unique instead of
// throwing).
function nextRevisionLabel(label: string): string {
  if (label.length === 1 && label >= 'A' && label < 'Z') {
    return String.fromCharCode(label.charCodeAt(0) + 1)
  }
  return `${label}1`
}

/**
 * `anter_configurator.revision.branch` (spec §3.8, Implementation Plan step
 * 33). Copies the drawing forward into a new, editable revision and runs the
 * supersession cascade on the one being left behind: its technical
 * acceptance goes `stale` (a `confirm` gated on it, X10, must never read a
 * verdict about a drawing that no longer exists) and any still-open
 * submission on it moves to `revision_requested` — the queue's signal that
 * this ticket's answer is now "look at the new revision", not "wait".
 * Offers superseding (Phase J — no `AnterOffer` entity yet) is out of scope.
 */
const revisionBranchCommand: CommandHandler<unknown, RevisionBranchResult> = {
  id: 'anter_configurator.revision.branch',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const previous = await em.findOne(AnterProjectRevision, {
      id: parsed.revisionId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      deletedAt: null,
    })
    if (!previous) throw new CrudHttpError(404, { error: '[internal] revision not found' })
    if (previous.state === 'draft') {
      throw new CrudHttpError(409, { error: '[internal] a draft revision has nothing to branch from' })
    }

    const project = await em.findOne(AnterProject, { id: previous.projectId, organizationId: parsed.organizationId, tenantId: parsed.tenantId })
    if (!project) throw new CrudHttpError(404, { error: '[internal] project not found' })

    const [elements, points, openSubmissions] = await Promise.all([
      em.find(AnterProjectElement, { revisionId: previous.id }),
      em.find(AnterPlanPoint, { revisionId: previous.id }),
      em.find(AnterSubmission, { revisionId: previous.id, state: { $in: OPEN_SUBMISSION_STATES } }),
    ])

    const nextRevisionId = randomUUID()
    const elementIdMap = new Map(elements.map((element) => [element.id, randomUUID()]))

    await withAtomicFlush(em, [
      () => {
        em.create(AnterProjectRevision, {
          id: nextRevisionId,
          projectId: previous.projectId,
          revisionLabel: nextRevisionLabel(previous.revisionLabel),
          state: 'draft',
          underlayAttachmentId: previous.underlayAttachmentId ?? null,
          underlayWidthUnits: previous.underlayWidthUnits ?? null,
          underlayHeightUnits: previous.underlayHeightUnits ?? null,
          metresPerUnit: previous.metresPerUnit ?? null,
          calibrationPoints: previous.calibrationPoints ?? null,
          gridSizeM: previous.gridSizeM,
          changeDescription: null,
          organizationId: parsed.organizationId,
          tenantId: parsed.tenantId,
        })

        for (const element of elements) {
          em.persist(em.create(AnterProjectElement, {
            id: elementIdMap.get(element.id)!,
            revisionId: nextRevisionId,
            elementKind: element.elementKind,
            productId: element.productId ?? null,
            productVariantId: element.productVariantId ?? null,
            skuSnapshot: element.skuSnapshot ?? null,
            nameSnapshot: element.nameSnapshot ?? null,
            geometry: element.geometry,
            hostElementId: element.hostElementId ? (elementIdMap.get(element.hostElementId) ?? null) : null,
            hostOffsetRatio: element.hostOffsetRatio ?? null,
            label: element.label ?? null,
            isOutsidePriceList: element.isOutsidePriceList,
            sortOrder: element.sortOrder,
            organizationId: parsed.organizationId,
            tenantId: parsed.tenantId,
          }))
        }

        for (const point of points) {
          em.persist(em.create(AnterPlanPoint, {
            id: randomUUID(),
            revisionId: nextRevisionId,
            pointKind: point.pointKind,
            position: point.position,
            state: 'open',
            skipReason: null,
            coveredByElementId: null,
            coverageRadiusM: point.coverageRadiusM,
            organizationId: parsed.organizationId,
            tenantId: parsed.tenantId,
          }))
        }

        project.currentRevisionId = nextRevisionId
        previous.technicalAcceptanceState = 'stale'

        for (const submission of openSubmissions) {
          const fromState = submission.state
          submission.state = 'revision_requested'
          submission.closedAt = new Date()
          em.persist(em.create(AnterSubmissionEvent, {
            id: randomUUID(),
            submissionId: submission.id,
            fromState,
            toState: 'revision_requested',
            reason: '[internal] superseded by a new revision branch',
            organizationId: parsed.organizationId,
            tenantId: parsed.tenantId,
          }))
        }
      },
    ], { transaction: true, label: 'anter_configurator.revision.branch' })

    return { revisionId: nextRevisionId, revisionLabel: nextRevisionLabel(previous.revisionLabel), projectId: previous.projectId }
  },
  buildLog: async ({ result }) => ({
    actionLabel: 'Branch Anter configurator revision',
    resourceKind: REVISION_RESOURCE_KIND,
    resourceId: result.revisionId,
    payload: { undo: { after: result } },
  }),
}

registerCommand(revisionBranchCommand)

export default revisionBranchCommand
