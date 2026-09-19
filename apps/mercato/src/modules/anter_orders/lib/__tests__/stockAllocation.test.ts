import { allocateOrderLineBestEffort, deriveOrderStatusAfterAllocation } from '../stockAllocation'
import { AnterOrderLine, AnterStockAllocation, AnterStockItem } from '../../data/entities'

const scope = { organizationId: 'org-1', tenantId: 'tenant-1' }

function makeLine(overrides: Partial<AnterOrderLine> = {}): AnterOrderLine {
  return { id: 'line-1', lineStatus: 'awaiting_stock', expectedAt: null } as AnterOrderLine
}

function makeEm(options: { stockItem?: AnterStockItem | null; existingAllocations?: AnterStockAllocation[] } = {}) {
  const created: unknown[] = []
  const em = {
    findOne: jest.fn(async () => options.stockItem ?? null),
    find: jest.fn(async () => options.existingAllocations ?? []),
    create: jest.fn((Entity: new () => unknown, data: Record<string, unknown>) => {
      const instance = Object.assign(new Entity(), data)
      created.push(instance)
      return instance
    }),
  }
  return { em: em as unknown as import('@mikro-orm/postgresql').EntityManager, created }
}

describe('allocateOrderLineBestEffort', () => {
  it('fully allocates when enough stock is on hand', async () => {
    const stockItem = { id: 'stock-1', onHand: 10, expectedRestockAt: null } as AnterStockItem
    const { em, created } = makeEm({ stockItem })
    const line = makeLine()

    const result = await allocateOrderLineBestEffort(em, line, {
      orderLineId: line.id,
      productId: 'product-1',
      variantId: null,
      quantity: 4,
      scope,
    })

    expect(result).toEqual({ allocatedQuantity: 4, shortfallQuantity: 0, expectedRestockAt: null })
    expect(line.lineStatus).toBe('allocated')
    expect(line.expectedAt).toBeNull()
    expect(created).toHaveLength(1)
    expect((created[0] as AnterStockAllocation).quantity).toBe('4')
  })

  it('partially allocates and keeps the line awaiting_stock when short, with the restock date', async () => {
    const expectedRestockAt = new Date('2026-02-01T00:00:00.000Z')
    const stockItem = { id: 'stock-1', onHand: 3, expectedRestockAt } as AnterStockItem
    const { em, created } = makeEm({ stockItem })
    const line = makeLine()

    const result = await allocateOrderLineBestEffort(em, line, {
      orderLineId: line.id,
      productId: 'product-1',
      variantId: null,
      quantity: 5,
      scope,
    })

    expect(result).toEqual({ allocatedQuantity: 3, shortfallQuantity: 2, expectedRestockAt })
    expect(line.lineStatus).toBe('awaiting_stock')
    expect(line.expectedAt).toBe(expectedRestockAt)
    expect(created).toHaveLength(1)
  })

  it('accounts for already-live allocations against the same stock item', async () => {
    const stockItem = { id: 'stock-1', onHand: 10, expectedRestockAt: null } as AnterStockItem
    const existing = [{ quantity: '7' } as AnterStockAllocation]
    const { em, created } = makeEm({ stockItem, existingAllocations: existing })
    const line = makeLine()

    const result = await allocateOrderLineBestEffort(em, line, {
      orderLineId: line.id,
      productId: 'product-1',
      variantId: null,
      quantity: 5,
      scope,
    })

    expect(result.allocatedQuantity).toBe(3)
    expect(result.shortfallQuantity).toBe(2)
    expect(created).toHaveLength(1)
  })

  it('creates no allocation row and marks awaiting_stock when the stock item does not exist', async () => {
    const { em, created } = makeEm({ stockItem: null })
    const line = makeLine()

    const result = await allocateOrderLineBestEffort(em, line, {
      orderLineId: line.id,
      productId: 'product-1',
      variantId: null,
      quantity: 2,
      scope,
    })

    expect(result).toEqual({ allocatedQuantity: 0, shortfallQuantity: 2, expectedRestockAt: null })
    expect(line.lineStatus).toBe('awaiting_stock')
    expect(created).toHaveLength(0)
  })
})

describe('deriveOrderStatusAfterAllocation', () => {
  it('stays placed when every line fully allocated and the order is not confirmed yet', () => {
    expect(deriveOrderStatusAfterAllocation({ currentStatus: 'placed', confirmedAt: null, lineStatuses: ['allocated', 'allocated'] })).toBe('placed')
  })

  it('becomes awaiting_stock when any line is short, even on a confirmed order', () => {
    expect(deriveOrderStatusAfterAllocation({ currentStatus: 'confirmed', confirmedAt: new Date(), lineStatuses: ['allocated', 'awaiting_stock'] })).toBe('awaiting_stock')
  })

  it('advances a confirmed order to picking once every line is allocated', () => {
    expect(deriveOrderStatusAfterAllocation({ currentStatus: 'awaiting_stock', confirmedAt: new Date(), lineStatuses: ['allocated', 'allocated'] })).toBe('picking')
  })

  it('never regresses an order already past picking', () => {
    expect(deriveOrderStatusAfterAllocation({ currentStatus: 'shipped_partially', confirmedAt: new Date(), lineStatuses: ['allocated', 'allocated'] })).toBe('shipped_partially')
  })
})
