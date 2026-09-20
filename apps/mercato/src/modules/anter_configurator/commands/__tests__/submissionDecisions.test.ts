import submissionAcceptTechnicalCommand from '../submissionAcceptTechnical'
import submissionRequestChangesCommand from '../submissionRequestChanges'
import submissionRejectCommand from '../submissionReject'
import { AnterProjectRevision, AnterSubmission } from '../../data/entities'

const scope = { organizationId: '22222222-2222-4222-a222-222222222222', tenantId: '33333333-3333-4333-a333-333333333333' }
const actorUserId = '99999999-9999-4999-a999-999999999999'
const revisionId = '55555555-5555-4555-a555-555555555555'

function makeSubmission(overrides: Partial<AnterSubmission> = {}) {
  return Object.assign(new AnterSubmission(), {
    id: '66666666-6666-4666-a666-666666666666',
    submissionNumber: 'KNF-2026-0001',
    projectId: '44444444-4444-4444-a444-444444444444',
    revisionId,
    track: 'priced',
    state: 'technical_review',
    submittedAt: new Date(),
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    ...overrides,
  })
}

function makeRevision() {
  return Object.assign(new AnterProjectRevision(), {
    id: revisionId,
    projectId: '44444444-4444-4444-a444-444444444444',
    revisionLabel: 'A',
    state: 'submitted',
    technicalAcceptanceState: 'none',
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
  })
}

function makeEm(state: { submission: AnterSubmission; revision: AnterProjectRevision }, commandBus?: { execute: jest.Mock }) {
  const em: Record<string, unknown> = {
    findOne: jest.fn(async (Entity: new () => unknown) => {
      if (Entity === AnterSubmission) return state.submission
      if (Entity === AnterProjectRevision) return state.revision
      return null
    }),
    create: jest.fn((Entity: new () => unknown, data: Record<string, unknown>) => Object.assign(new Entity(), data)),
    persist: jest.fn(() => em),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
  }
  em.fork = jest.fn(() => em)
  return {
    container: {
      resolve: jest.fn((key: string) => {
        if (key === 'em') return em
        if (key === 'commandBus' && commandBus) return commandBus
        throw new Error(`not registered: ${key}`)
      }),
    },
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
  }
}

describe('anter_configurator.submission.accept_technical', () => {
  it('closes a priced submission and stamps the revision technically accepted', async () => {
    const submission = makeSubmission({ track: 'priced' })
    const revision = makeRevision()
    const ctx = makeEm({ submission, revision })

    const result = await submissionAcceptTechnicalCommand.execute!({ ...scope, submissionId: submission.id, actorUserId }, ctx as never)

    expect(result.state).toBe('closed_order')
    expect(submission.closedAt).not.toBeNull()
    expect(revision.technicalAcceptanceState).toBe('accepted')
    expect(revision.technicalAcceptedByUserId).toBe(actorUserId)
  })

  it('moves an unpriced submission to valuation, not closed', async () => {
    const submission = makeSubmission({ track: 'unpriced' })
    const revision = makeRevision()
    const ctx = makeEm({ submission, revision })

    const result = await submissionAcceptTechnicalCommand.execute!({ ...scope, submissionId: submission.id, actorUserId }, ctx as never)

    expect(result.state).toBe('valuation')
    expect(submission.closedAt).toBeFalsy()
  })

  it('refuses a submission that is not awaiting technical review', async () => {
    const submission = makeSubmission({ state: 'rejected' })
    const revision = makeRevision()
    const ctx = makeEm({ submission, revision })
    await expect(submissionAcceptTechnicalCommand.execute!({ ...scope, submissionId: submission.id, actorUserId }, ctx as never)).rejects.toThrow()
  })
})

describe('anter_configurator.submission.request_changes', () => {
  it('moves the submission to revision_requested without touching the revision', async () => {
    const submission = makeSubmission()
    const revision = makeRevision()
    const ctx = makeEm({ submission, revision })

    const result = await submissionRequestChangesCommand.execute!({ ...scope, submissionId: submission.id, actorUserId, reason: 'Post spacing exceeds policy' }, ctx as never)

    expect(result.state).toBe('revision_requested')
    expect(revision.technicalAcceptanceState).toBe('none')
  })
})

describe('anter_configurator.submission.reject', () => {
  it('rejects a priced submission and puts its resulting order on technical hold', async () => {
    const orderId = '77777777-7777-4777-a777-777777777777'
    const submission = makeSubmission({ track: 'priced', resultingOrderId: orderId })
    const revision = makeRevision()
    const commandBus = { execute: jest.fn(async () => ({ result: { orderId, status: 'technical_hold' } })) }
    const ctx = makeEm({ submission, revision }, commandBus)

    const result = await submissionRejectCommand.execute!({ ...scope, submissionId: submission.id, actorUserId, reason: 'Unsafe anchor spacing' }, ctx as never)

    expect(result.state).toBe('rejected')
    expect(commandBus.execute).toHaveBeenCalledWith(
      'anter_orders.order.set_technical_hold',
      expect.objectContaining({ input: expect.objectContaining({ orderId }) }),
    )
  })

  it('rejects an unpriced submission without touching anter_orders', async () => {
    const submission = makeSubmission({ track: 'unpriced', resultingOrderId: null })
    const revision = makeRevision()
    const commandBus = { execute: jest.fn() }
    const ctx = makeEm({ submission, revision }, commandBus)

    const result = await submissionRejectCommand.execute!({ ...scope, submissionId: submission.id, actorUserId, reason: 'Not feasible' }, ctx as never)

    expect(result.state).toBe('rejected')
    expect(commandBus.execute).not.toHaveBeenCalled()
  })
})
