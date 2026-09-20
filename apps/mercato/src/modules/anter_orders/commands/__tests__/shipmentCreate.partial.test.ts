import shipmentCreateCommand from '../shipmentCreate'

const scope = {
  organizationId: '22222222-2222-4222-a222-222222222222',
  tenantId: '33333333-3333-4333-a333-333333333333',
}
const ORDER_ID = '44444444-4444-4444-a444-444444444444'
const LINE_A = '55555555-5555-4555-a555-555555555555'
const LINE_B = '66666666-6666-4666-a666-666666666666'

function makeOrder() {
  return { id: ORDER_ID, ...scope, orderNumber: 'ZAM-1', status: 'confirmed', confirmedAt: new Date(), closedAt: null }
}

function makeLines() {
  return [
    { id: LINE_A, orderId: ORDER_ID, ...scope, quantity: '10', shippedQuantity: '0', lineStatus: 'allocated' },
    { id: LINE_B, orderId: ORDER_ID, ...scope, quantity: '5', shippedQuantity: '0', lineStatus: 'allocated' },
  ]
}

function makeCtx(order: Record<string, unknown>, lines: Record<string, unknown>[]) {
  const em: Record<string, unknown> = {
    findOne: jest.fn(async () => order),
    // The fix under test: the command must read EVERY line of the order, so this
    // mock deliberately ignores any id filter and returns the full set.
    find: jest.fn(async (_e: unknown, where: any) => where?.id?.$in ? lines.filter((l) => where.id.$in.includes(l.id)) : lines),
    count: jest.fn(async () => 0),
    create: jest.fn((Entity: new () => unknown, data: Record<string, unknown>) => Object.assign(new Entity(), data)),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
    getConnection: jest.fn(() => ({ execute: jest.fn(async () => []) })),
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

describe('anter_orders.shipment.create — partial shipments', () => {
  it('keeps the order open as shipped_partially when only some lines ship', async () => {
    const order = makeOrder()
    const lines = makeLines()
    const ctx = makeCtx(order, lines)

    await shipmentCreateCommand.execute!({
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      orderId: ORDER_ID,
      lines: [{ orderLineId: LINE_A, quantity: 10 }],
    }, ctx as never)

    expect(order.status).toBe('shipped_partially')
    expect(order.closedAt).toBeNull()
  })

  it('closes the order as shipped only once every line is fully shipped', async () => {
    const order = makeOrder()
    const lines = makeLines()
    const ctx = makeCtx(order, lines)

    await shipmentCreateCommand.execute!({
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      orderId: ORDER_ID,
      lines: [{ orderLineId: LINE_A, quantity: 10 }, { orderLineId: LINE_B, quantity: 5 }],
    }, ctx as never)

    expect(order.status).toBe('shipped')
    expect(order.closedAt).toBeInstanceOf(Date)
  })
})
