import customItemPriceCommand from '../customItemPrice'
import { AnterBomLine, AnterCustomItem, AnterProjectRevision } from '../../data/entities'

const scope = { organizationId: '22222222-2222-4222-a222-222222222222', tenantId: '33333333-3333-4333-a333-333333333333' }
const actorUserId = '99999999-9999-4999-a999-999999999999'
const revisionId = '55555555-5555-4555-a555-555555555555'

function makeItem(overrides: Partial<AnterCustomItem> = {}) {
  return Object.assign(new AnterCustomItem(), {
    id: '66666666-6666-4666-a666-666666666666',
    revisionId,
    description: 'Curved barrier',
    quantity: '1',
    unitCode: 'pcs',
    valuationState: 'awaiting',
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    ...overrides,
  })
}

function makeRevision(hasUnpricedItems = true) {
  return Object.assign(new AnterProjectRevision(), {
    id: revisionId,
    hasUnpricedItems,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
  })
}

function makeCtx(state: { item: AnterCustomItem; revision: AnterProjectRevision; otherAwaitingCount?: number; toQuoteLineCount?: number }) {
  const em: Record<string, unknown> = {
    findOne: jest.fn(async (Entity: new () => unknown) => {
      if (Entity === AnterCustomItem) return state.item
      if (Entity === AnterProjectRevision) return state.revision
      return null
    }),
    count: jest.fn(async (Entity: new () => unknown, where: Record<string, unknown>) => {
      if (Entity === AnterCustomItem) return state.otherAwaitingCount ?? 0
      if (Entity === AnterBomLine) return state.toQuoteLineCount ?? 0
      return 0
    }),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
  }
  em.fork = jest.fn(() => em)
  return {
    container: { resolve: jest.fn((key: string) => { if (key === 'em') return em; throw new Error(`not registered: ${key}`) }) },
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
  }
}

describe('anter_configurator.custom_item.price', () => {
  it('prices the item and clears the revision flag when nothing else is outstanding', async () => {
    const item = makeItem()
    const revision = makeRevision(true)
    const ctx = makeCtx({ item, revision, otherAwaitingCount: 0, toQuoteLineCount: 0 })

    const result = await customItemPriceCommand.execute!({ ...scope, customItemId: item.id, actorUserId, unitPriceNet: 450 }, ctx as never)

    expect(item.valuationState).toBe('priced')
    expect(item.unitPriceNet).toBe('450')
    expect(result.revisionHasUnpricedItems).toBe(false)
    expect(revision.hasUnpricedItems).toBe(false)
  })

  it('leaves the revision flag set when another item is still awaiting', async () => {
    const item = makeItem()
    const revision = makeRevision(true)
    const ctx = makeCtx({ item, revision, otherAwaitingCount: 1, toQuoteLineCount: 0 })

    const result = await customItemPriceCommand.execute!({ ...scope, customItemId: item.id, actorUserId, unitPriceNet: 450 }, ctx as never)

    expect(result.revisionHasUnpricedItems).toBe(true)
    expect(revision.hasUnpricedItems).toBe(true)
  })

  it('leaves the revision flag set when a BOM line is still to_quote', async () => {
    const item = makeItem()
    const revision = makeRevision(true)
    const ctx = makeCtx({ item, revision, otherAwaitingCount: 0, toQuoteLineCount: 1 })

    const result = await customItemPriceCommand.execute!({ ...scope, customItemId: item.id, actorUserId, unitPriceNet: 450 }, ctx as never)

    expect(result.revisionHasUnpricedItems).toBe(true)
  })
})
