import offerAcceptCommand from '../offerAccept'
import { AnterOffer, AnterOfferLine, AnterProject } from '../../data/entities'

const scope = { organizationId: '22222222-2222-4222-a222-222222222222', tenantId: '33333333-3333-4333-a333-333333333333' }
const customerUserId = '88888888-8888-4888-a888-888888888888'

function makeOffer(overrides: Partial<AnterOffer> = {}) {
  return Object.assign(new AnterOffer(), {
    id: '66666666-6666-4666-a666-666666666666',
    projectId: '44444444-4444-4444-a444-444444444444',
    revisionId: '55555555-5555-4555-a555-555555555555',
    customerEntityId: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
    status: 'issued',
    currencyCode: 'PLN',
    validUntil: '2099-01-01',
    shippingNetAmount: '0',
    grandTotalNetAmount: '200',
    grandTotalGrossAmount: '246',
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    ...overrides,
  })
}

function makeLine(overrides: Partial<AnterOfferLine> = {}) {
  return Object.assign(new AnterOfferLine(), {
    id: 'line-1',
    offerId: '66666666-6666-4666-a666-666666666666',
    lineNumber: 1,
    productId: 'p1',
    nameSnapshot: 'Barrier',
    quantity: '2',
    unitCode: 'pcs',
    unitPriceNet: '100',
    listUnitPriceNet: '120',
    taxRate: '0',
    isAwaitingValuation: false,
    ...overrides,
  })
}

function makeCtx(state: { offer: AnterOffer; lines: AnterOfferLine[] }, commandBusExecute?: jest.Mock) {
  const project = Object.assign(new AnterProject(), { id: state.offer.projectId, currentRevisionId: 'newer-revision' })
  const em: Record<string, unknown> = {
    findOne: jest.fn(async (Entity: new () => unknown) => {
      if (Entity === AnterOffer) return state.offer
      if (Entity === AnterProject) return project
      return null
    }),
    find: jest.fn(async (Entity: new () => unknown) => {
      if (Entity === AnterOfferLine) return state.lines
      return []
    }),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
  }
  em.fork = jest.fn(() => em)
  const commandBus = {
    execute: commandBusExecute ?? jest.fn(async () => ({
      result: { orderId: 'order-1', orderNumber: 'ZAM-2026-0001' },
      logEntry: { undoToken: 'undo-token-1' },
    })),
    undo: jest.fn(async () => undefined),
  }
  return {
    container: {
      resolve: jest.fn((key: string) => {
        if (key === 'em') return em
        if (key === 'commandBus') return commandBus
        throw new Error(`not registered: ${key}`)
      }),
    },
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
    commandBus,
  }
}

describe('anter_configurator.offer.accept (spec §3.10/X9)', () => {
  it('places the order at the frozen offer prices without re-pricing', async () => {
    const offer = makeOffer()
    const lines = [makeLine()]
    const ctx = makeCtx({ offer, lines })

    const result = await offerAcceptCommand.execute!({
      ...scope, offerId: offer.id, customerUserId, deliveryMode: 'self_collection',
    }, ctx as never)

    expect(result.orderId).toBe('order-1')
    expect(offer.status).toBe('accepted')
    expect(offer.acceptedAt).toBeInstanceOf(Date)

    const placeCall = ctx.commandBus.execute.mock.calls.find((call) => call[0] === 'anter_orders.order.place')
    expect(placeCall).toBeTruthy()
    const placeInput = placeCall![1].input
    expect(placeInput.source).toBe('crm_offer')
    expect(placeInput.offerId).toBe(offer.id)
    expect(placeInput.lines[0].unitPriceNet).toBe(100) // the offer's frozen price, not re-resolved
  })

  it('refuses to accept an offer with a still-awaiting-valuation line', async () => {
    const offer = makeOffer()
    const lines = [makeLine({ isAwaitingValuation: true, unitPriceNet: null })]
    const ctx = makeCtx({ offer, lines })

    await expect(offerAcceptCommand.execute!({
      ...scope, offerId: offer.id, customerUserId, deliveryMode: 'self_collection',
    }, ctx as never)).rejects.toThrow()
  })

  it('refuses to accept a superseded offer with the spec-shaped revision_superseded error', async () => {
    const offer = makeOffer({ status: 'superseded' })
    const ctx = makeCtx({ offer, lines: [] })

    await expect(offerAcceptCommand.execute!({
      ...scope, offerId: offer.id, customerUserId, deliveryMode: 'self_collection',
    }, ctx as never)).rejects.toMatchObject({ body: { error: 'revision_superseded' } })
  })

  it('refuses an expired offer', async () => {
    const offer = makeOffer({ validUntil: '2000-01-01' })
    const ctx = makeCtx({ offer, lines: [makeLine()] })

    await expect(offerAcceptCommand.execute!({
      ...scope, offerId: offer.id, customerUserId, deliveryMode: 'self_collection',
    }, ctx as never)).rejects.toMatchObject({ body: { error: 'offer_expired' } })
  })

  it('undo cancels the order through its own undo token and restores the offer to issued', async () => {
    const offer = makeOffer()
    const lines = [makeLine()]
    const ctx = makeCtx({ offer, lines })
    await offerAcceptCommand.execute!({ ...scope, offerId: offer.id, customerUserId, deliveryMode: 'self_collection' }, ctx as never)

    await offerAcceptCommand.undo!({
      logEntry: {
        resourceId: offer.id,
        commandPayload: { undo: { before: { status: 'issued', acceptedAt: null }, after: { orderId: 'order-1', orderUndoToken: 'undo-token-1' } } },
      } as never,
      ctx: ctx as never,
      input: undefined as never,
    })

    expect(offer.status).toBe('issued')
    expect(offer.acceptedAt).toBeNull()
    expect(ctx.commandBus.undo).toHaveBeenCalledWith('undo-token-1', expect.anything())
  })
})
