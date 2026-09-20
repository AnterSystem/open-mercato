import offerIssueCommand from '../offerIssue'
import { AnterOffer } from '../../data/entities'

const scope = { organizationId: '22222222-2222-4222-a222-222222222222', tenantId: '33333333-3333-4333-a333-333333333333' }
const actorUserId = '99999999-9999-4999-a999-999999999999'

function makeOffer(overrides: Partial<AnterOffer> = {}) {
  return Object.assign(new AnterOffer(), {
    id: '66666666-6666-4666-a666-666666666666',
    projectId: '44444444-4444-4444-a444-444444444444',
    revisionId: '55555555-5555-4555-a555-555555555555',
    status: 'draft',
    currencyCode: 'PLN',
    validUntil: '2026-12-31',
    subtotalNetAmount: '200',
    grandTotalNetAmount: '200',
    grandTotalGrossAmount: '246',
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    ...overrides,
  })
}

function makeCtx(offer: AnterOffer) {
  const em: Record<string, unknown> = {
    findOne: jest.fn(async () => offer),
    flush: jest.fn(async () => undefined),
    begin: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
  }
  em.fork = jest.fn(() => em)
  const numberService = { generate: jest.fn(async () => 'OF-2026-0001') }
  return {
    container: {
      resolve: jest.fn((key: string) => {
        if (key === 'em') return em
        if (key === 'anterOfferNumberService') return numberService
        throw new Error(`not registered: ${key}`)
      }),
    },
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
  }
}

describe('anter_configurator.offer.issue (spec CC-4)', () => {
  it('assigns a number and moves draft to issued', async () => {
    const offer = makeOffer()
    const ctx = makeCtx(offer)
    const result = await offerIssueCommand.execute!({ ...scope, offerId: offer.id, actorUserId }, ctx as never)

    expect(result.offerNumber).toBe('OF-2026-0001')
    expect(offer.status).toBe('issued')
    expect(offer.issuedAt).toBeInstanceOf(Date)
  })

  it('refuses to issue anything but a draft', async () => {
    const offer = makeOffer({ status: 'issued' })
    const ctx = makeCtx(offer)
    await expect(offerIssueCommand.execute!({ ...scope, offerId: offer.id, actorUserId }, ctx as never)).rejects.toThrow()
  })

  it('undo reverts status but never releases the assigned number', async () => {
    const offer = makeOffer()
    const ctx = makeCtx(offer)
    await offerIssueCommand.execute!({ ...scope, offerId: offer.id, actorUserId }, ctx as never)
    expect(offer.offerNumber).toBe('OF-2026-0001')

    await offerIssueCommand.undo!({
      logEntry: { resourceId: offer.id, commandPayload: { undo: { before: { status: 'draft', issuedAt: null } } } } as never,
      ctx: ctx as never,
      input: undefined as never,
    })

    expect(offer.status).toBe('draft')
    expect(offer.issuedAt).toBeNull()
    expect(offer.offerNumber).toBe('OF-2026-0001')
  })
})
