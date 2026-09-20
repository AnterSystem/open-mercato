/** @jest-environment node */
import type { MutationGuardInput } from '@open-mercato/shared/lib/crud/mutation-guard-registry'
import { runMutationGuards } from '@open-mercato/shared/lib/crud/mutation-guard-registry'

const ORG = '33333333-3333-4333-8333-333333333333'
const TENANT = '11111111-1111-4111-8111-111111111111'
const CATALOG_ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONFIGURATOR_ORDER_ACCEPTED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CONFIGURATOR_ORDER_PENDING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REVISION_ACCEPTED_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const REVISION_PENDING_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const orders: Record<string, { id: string; source: string; configuratorRevisionId: string | null; status: string }> = {
  [CATALOG_ORDER_ID]: { id: CATALOG_ORDER_ID, source: 'catalog', configuratorRevisionId: null, status: 'placed' },
  [CONFIGURATOR_ORDER_ACCEPTED_ID]: { id: CONFIGURATOR_ORDER_ACCEPTED_ID, source: 'configurator', configuratorRevisionId: REVISION_ACCEPTED_ID, status: 'placed' },
  [CONFIGURATOR_ORDER_PENDING_ID]: { id: CONFIGURATOR_ORDER_PENDING_ID, source: 'configurator', configuratorRevisionId: REVISION_PENDING_ID, status: 'placed' },
}

const revisions: Record<string, { id: string; technicalAcceptanceState: string }> = {
  [REVISION_ACCEPTED_ID]: { id: REVISION_ACCEPTED_ID, technicalAcceptanceState: 'accepted' },
  [REVISION_PENDING_ID]: { id: REVISION_PENDING_ID, technicalAcceptanceState: 'none' },
}

const mockOrderReadService = {
  getSourceInfo: jest.fn(async (_scope: unknown, orderId: string) => orders[orderId] ?? null),
}

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(async () => ({
    resolve: (name: string) => {
      if (name === 'anterOrderReadService') return mockOrderReadService
      if (name === 'em') return {
        fork: () => ({
          findOne: async (_entity: unknown, where: Record<string, unknown>) => revisions[where.id as string] ?? null,
        }),
      }
      throw new Error(`unknown service: ${name}`)
    },
  })),
}))

const { guards } = require('../guards') as { guards: import('@open-mercato/shared/lib/crud/mutation-guard-registry').MutationGuard[] }

function makeInput(overrides: Partial<MutationGuardInput>): MutationGuardInput {
  return {
    tenantId: TENANT,
    organizationId: ORG,
    userId: 'user-1',
    resourceKind: 'anter_orders.order.confirm',
    resourceId: null,
    operation: 'update',
    requestMethod: 'POST',
    requestHeaders: new Headers(),
    mutationPayload: null,
    ...overrides,
  }
}

describe('anter_configurator order-confirm technical-acceptance guard (spec X10)', () => {
  it('declares itself against the CONFIRM-specific resourceKind only, never the generic order one', () => {
    expect(guards[0].targetEntity).toBe('anter_orders.order.confirm')
    expect(guards[0].operations).toEqual(['update'])
  })

  it('allows confirming a catalog-sourced order unconstrained', async () => {
    const result = await runMutationGuards(guards, makeInput({ resourceId: CATALOG_ORDER_ID }), { userFeatures: [] })
    expect(result.ok).toBe(true)
  })

  it('blocks confirming a configurator-sourced order whose revision is not yet technically accepted', async () => {
    const result = await runMutationGuards(guards, makeInput({ resourceId: CONFIGURATOR_ORDER_PENDING_ID }), { userFeatures: [] })
    expect(result.ok).toBe(false)
    expect(result.errorStatus).toBe(422)
    expect(result.errorBody).toMatchObject({ error: 'technical_acceptance_required', technicalAcceptanceState: 'none' })
  })

  it('allows confirming a configurator-sourced order once its revision is accepted', async () => {
    const result = await runMutationGuards(guards, makeInput({ resourceId: CONFIGURATOR_ORDER_ACCEPTED_ID }), { userFeatures: [] })
    expect(result.ok).toBe(true)
  })

  it('never blocks a DIFFERENT order resourceKind — shipments/invoices/allocation use the generic anter_orders.order kind', async () => {
    const result = await runMutationGuards(
      guards,
      makeInput({ resourceKind: 'anter_orders.order', resourceId: CONFIGURATOR_ORDER_PENDING_ID }),
      { userFeatures: [] },
    )
    expect(result.ok).toBe(true)
  })

  it('module-absent behaviour: with no guards registered, confirm proceeds unconstrained even for a pending configurator order', async () => {
    const result = await runMutationGuards([], makeInput({ resourceId: CONFIGURATOR_ORDER_PENDING_ID }), { userFeatures: [] })
    expect(result.ok).toBe(true)
  })
})
