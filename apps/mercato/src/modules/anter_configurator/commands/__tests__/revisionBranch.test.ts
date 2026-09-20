import revisionBranchCommand from '../revisionBranch'
import { AnterProject, AnterProjectRevision, AnterSubmission } from '../../data/entities'

const scope = { organizationId: '22222222-2222-4222-a222-222222222222', tenantId: '33333333-3333-4333-a333-333333333333' }
const projectId = '44444444-4444-4444-a444-444444444444'
const oldRevisionId = '55555555-5555-4555-a555-555555555555'

function makeState() {
  const project = Object.assign(new AnterProject(), { id: projectId, name: 'Test', currentRevisionId: oldRevisionId, organizationId: scope.organizationId, tenantId: scope.tenantId })
  const revision = Object.assign(new AnterProjectRevision(), {
    id: oldRevisionId,
    projectId,
    revisionLabel: 'A',
    state: 'submitted',
    technicalAcceptanceState: 'none',
    gridSizeM: '0.5',
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
  })
  const openSubmission = Object.assign(new AnterSubmission(), {
    id: '66666666-6666-4666-a666-666666666666',
    revisionId: oldRevisionId,
    projectId,
    track: 'unpriced',
    state: 'technical_review',
    submissionNumber: 'KNF-2026-0001',
    submittedAt: new Date(),
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
  })
  return { project, revision, openSubmission }
}

function makeEm(state: ReturnType<typeof makeState>) {
  const created: unknown[] = []
  const em: Record<string, unknown> = {
    findOne: jest.fn(async (Entity: new () => unknown) => {
      if (Entity === AnterProjectRevision) return state.revision
      if (Entity === AnterProject) return state.project
      return null
    }),
    find: jest.fn(async (Entity: new () => unknown) => {
      if (Entity === AnterSubmission) return [state.openSubmission]
      return []
    }),
    create: jest.fn((Entity: new () => unknown, data: Record<string, unknown>) => {
      const entity = Object.assign(new Entity(), data)
      created.push(entity)
      return entity
    }),
    persist: jest.fn((entity: unknown) => { created.push(entity); return em }),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
  }
  em.fork = jest.fn(() => em)
  return { em, created }
}

function makeCtx(em: unknown) {
  return {
    container: { resolve: jest.fn((key: string) => { if (key === 'em') return em; throw new Error(`not registered: ${key}`) }) },
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
  }
}

describe('anter_configurator.revision.branch (spec §3.8 supersession cascade)', () => {
  it('refuses to branch a draft revision — nothing to branch from', async () => {
    const state = makeState()
    state.revision.state = 'draft'
    const { em } = makeEm(state)
    await expect(revisionBranchCommand.execute!({ ...scope, revisionId: oldRevisionId }, makeCtx(em) as never)).rejects.toThrow()
  })

  it('increments the revision label, points the project at the new revision, and stales the old one', async () => {
    const state = makeState()
    const { em } = makeEm(state)
    const result = await revisionBranchCommand.execute!({ ...scope, revisionId: oldRevisionId }, makeCtx(em) as never)

    expect(result.revisionLabel).toBe('B')
    expect(state.project.currentRevisionId).toBe(result.revisionId)
    expect(state.revision.technicalAcceptanceState).toBe('stale')
  })

  it('moves every open submission on the old revision to revision_requested', async () => {
    const state = makeState()
    const { em } = makeEm(state)
    await revisionBranchCommand.execute!({ ...scope, revisionId: oldRevisionId }, makeCtx(em) as never)

    expect(state.openSubmission.state).toBe('revision_requested')
    expect(state.openSubmission.closedAt).not.toBeNull()
  })
})
