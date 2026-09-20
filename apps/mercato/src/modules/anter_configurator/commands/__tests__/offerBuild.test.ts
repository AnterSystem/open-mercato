import offerBuildCommand from '../offerBuild'
import { AnterBomLine, AnterCustomItem, AnterOffer, AnterOfferLine, AnterProject, AnterProjectRevision } from '../../data/entities'

const scope = { organizationId: '22222222-2222-4222-a222-222222222222', tenantId: '33333333-3333-4333-a333-333333333333' }
const revisionId = '55555555-5555-4555-a555-555555555555'
const projectId = '44444444-4444-4444-a444-444444444444'

function makeState(overrides: { bomLines?: Partial<AnterBomLine>[]; customItems?: Partial<AnterCustomItem>[] } = {}) {
  const project = Object.assign(new AnterProject(), { id: projectId, name: 'Test', customerEntityId: 'cccccccc-cccc-4ccc-accc-cccccccccccc', customerDealId: null, organizationId: scope.organizationId, tenantId: scope.tenantId })
  const revision = Object.assign(new AnterProjectRevision(), { id: revisionId, projectId, revisionLabel: 'A', bomCurrencyCode: 'PLN', organizationId: scope.organizationId, tenantId: scope.tenantId })
  const bomLines = (overrides.bomLines ?? [
    { id: 'line-1', productId: 'p1', nameSnapshot: 'Barrier', origin: 'drawn', quantity: '2', unitCode: 'pcs', priceState: 'priced', partnerUnitPriceNet: '100', listUnitPriceNet: '120' },
  ]).map((data) => Object.assign(new AnterBomLine(), { revisionId, organizationId: scope.organizationId, tenantId: scope.tenantId, ...data }))
  const customItems = (overrides.customItems ?? []).map((data) => Object.assign(new AnterCustomItem(), { revisionId, organizationId: scope.organizationId, tenantId: scope.tenantId, ...data }))
  return { project, revision, bomLines, customItems }
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
      if (Entity === AnterBomLine) return state.bomLines
      if (Entity === AnterCustomItem) return state.customItems
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

describe('anter_configurator.offer.build (spec §3.10/§3.11)', () => {
  it('totals only the priced lines and marks nothing incomplete when everything is priced', async () => {
    const state = makeState()
    const { em, created } = makeEm(state)
    const result = await offerBuildCommand.execute!({ ...scope, revisionId }, makeCtx(em) as never)

    expect(result.isIncomplete).toBe(false)
    expect(result.grandTotalNetAmount).toBeCloseTo(200)
    const offer = created.find((entity) => entity instanceof AnterOffer) as AnterOffer
    expect(offer.status).toBe('draft')
    expect(offer.offerNumber ?? null).toBeNull()
  })

  it('excludes an awaiting custom item from the total and flags is_incomplete', async () => {
    const state = makeState({ customItems: [{ id: 'ci-1', description: 'Curved barrier', quantity: '1', unitCode: 'pcs', valuationState: 'awaiting' }] })
    const { em, created } = makeEm(state)
    const result = await offerBuildCommand.execute!({ ...scope, revisionId }, makeCtx(em) as never)

    expect(result.isIncomplete).toBe(true)
    expect(result.grandTotalNetAmount).toBeCloseTo(200) // the custom item contributes nothing
    const awaitingLine = (created.filter((entity) => entity instanceof AnterOfferLine) as AnterOfferLine[])
      .find((line) => line.customItemId === 'ci-1')
    expect(awaitingLine?.isAwaitingValuation).toBe(true)
    expect(awaitingLine?.unitPriceNet ?? null).toBeNull()
  })

  it('excludes a to_quote BOM line from the total', async () => {
    const state = makeState({
      bomLines: [
        { id: 'line-1', productId: 'p1', nameSnapshot: 'Barrier', origin: 'drawn', quantity: '2', unitCode: 'pcs', priceState: 'priced', partnerUnitPriceNet: '100' },
        { id: 'line-2', productId: 'p2', nameSnapshot: 'Special panel', origin: 'drawn', quantity: '1', unitCode: 'pcs', priceState: 'to_quote' },
      ],
    })
    const { em } = makeEm(state)
    const result = await offerBuildCommand.execute!({ ...scope, revisionId }, makeCtx(em) as never)

    expect(result.isIncomplete).toBe(true)
    expect(result.grandTotalNetAmount).toBeCloseTo(200)
  })
})
