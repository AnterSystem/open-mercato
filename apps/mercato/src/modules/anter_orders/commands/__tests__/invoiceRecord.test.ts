import invoiceRecordCommand from '../invoiceRecord'

const scope = { organizationId: '22222222-2222-4222-a222-222222222222', tenantId: '33333333-3333-4333-a333-333333333333' }
const order = { id: '44444444-4444-4444-a444-444444444444', organizationId: scope.organizationId, tenantId: scope.tenantId, currencyCode: 'PLN' }

function makeEm() {
  const em: Record<string, unknown> = {
    findOne: jest.fn(async () => order),
    create: jest.fn((Entity: new () => unknown, data: Record<string, unknown>) => Object.assign(new Entity(), data)),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
  }
  em.fork = jest.fn(() => em)
  return em
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  const em = makeEm()
  return {
    ctx: {
      container: {
        resolve: jest.fn((key: string) => {
          if (key === 'em') return em
          if (key in overrides) return overrides[key]
          throw new Error(`not registered: ${key}`)
        }),
      },
      auth: null,
      organizationScope: null,
      selectedOrganizationId: scope.organizationId,
      organizationIds: [scope.organizationId],
    },
    em,
  }
}

describe('anter_orders.invoice.record', () => {
  it('records an invoice without an attachment', async () => {
    const { ctx } = makeCtx()
    const result = await invoiceRecordCommand.execute!({
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      orderId: order.id,
      invoiceNumber: 'FV-1',
      issuedAt: '2026-01-01',
      netAmount: 100,
      grossAmount: 123,
    }, ctx as never)

    expect(result.orderId).toBe(order.id)
    expect(result.invoiceId).toBeTruthy()
  })

  it('works when the attachments module is absent (module-absent behaviour)', async () => {
    // No 'attachmentService' registered — container.resolve throws, and the
    // command must still succeed rather than hard-depending on the module.
    const { ctx } = makeCtx()
    const result = await invoiceRecordCommand.execute!({
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      orderId: order.id,
      invoiceNumber: 'FV-2',
      issuedAt: '2026-01-01',
      netAmount: 100,
      grossAmount: 123,
      attachmentId: '11111111-1111-4111-a111-111111111111',
    }, ctx as never)

    expect(result.orderId).toBe(order.id)
  })

  it('rejects when the attachment service is present but the attachment does not exist', async () => {
    const { ctx } = makeCtx({ attachmentService: { findById: jest.fn(async () => null) } })
    await expect(invoiceRecordCommand.execute!({
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      orderId: order.id,
      invoiceNumber: 'FV-3',
      issuedAt: '2026-01-01',
      netAmount: 100,
      grossAmount: 123,
      attachmentId: '11111111-1111-4111-a111-111111111111',
    }, ctx as never)).rejects.toMatchObject({ status: 422 })
  })
})
