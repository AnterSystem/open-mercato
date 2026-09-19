import { consumeAllocationsForShipment } from '../shipmentAllocation'
import { AnterStockAllocation } from '../../data/entities'

const scope = { organizationId: 'org-1', tenantId: 'tenant-1' }

function makeAllocation(overrides: Partial<AnterStockAllocation> = {}): AnterStockAllocation {
  return {
    id: 'alloc-1',
    orderLineId: 'line-1',
    stockItemId: 'stock-1',
    quantity: '5',
    status: 'allocated',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as AnterStockAllocation
}

function makeEm(allocations: AnterStockAllocation[]) {
  const created: AnterStockAllocation[] = []
  const em = {
    find: jest.fn(async () => allocations),
    create: jest.fn((Entity: new () => unknown, data: Record<string, unknown>) => {
      const instance = Object.assign(new Entity(), data) as AnterStockAllocation
      created.push(instance)
      return instance
    }),
  }
  return { em: em as unknown as import('@mikro-orm/postgresql').EntityManager, created }
}

describe('consumeAllocationsForShipment', () => {
  it('marks a single allocation fully shipped when the quantity matches exactly', async () => {
    const allocation = makeAllocation({ quantity: '5' })
    const { em, created } = makeEm([allocation])

    await consumeAllocationsForShipment(em, 'line-1', 5, scope)

    expect(allocation.status).toBe('shipped')
    expect(created).toHaveLength(0)
  })

  it('splits an allocation when shipping less than its full quantity', async () => {
    const allocation = makeAllocation({ id: 'alloc-1', quantity: '10' })
    const { em, created } = makeEm([allocation])

    await consumeAllocationsForShipment(em, 'line-1', 4, scope)

    expect(allocation.status).toBe('allocated')
    expect(allocation.quantity).toBe('6')
    expect(created).toHaveLength(1)
    expect(created[0].status).toBe('shipped')
    expect(created[0].quantity).toBe('4')
    expect(created[0].stockItemId).toBe('stock-1')
  })

  it('consumes multiple allocations FIFO to satisfy the shipped quantity', async () => {
    const first = makeAllocation({ id: 'alloc-1', quantity: '3', createdAt: new Date('2026-01-01T00:00:00.000Z') })
    const second = makeAllocation({ id: 'alloc-2', quantity: '10', createdAt: new Date('2026-01-02T00:00:00.000Z') })
    const { em, created } = makeEm([first, second])

    await consumeAllocationsForShipment(em, 'line-1', 7, scope)

    expect(first.status).toBe('shipped')
    expect(second.status).toBe('allocated')
    expect(second.quantity).toBe('6')
    expect(created).toHaveLength(1)
    expect(created[0].quantity).toBe('4')
  })

  it('throws when the line does not have enough live allocation to ship', async () => {
    const allocation = makeAllocation({ quantity: '2' })
    const { em } = makeEm([allocation])

    await expect(consumeAllocationsForShipment(em, 'line-1', 5, scope)).rejects.toMatchObject({ status: 422 })
  })
})
