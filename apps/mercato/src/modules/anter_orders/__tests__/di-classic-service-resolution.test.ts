// Regression test mirroring packages/core/src/__tests__/di-classic-service-resolution.test.ts.
//
// `createRequestContainer()` builds the request container with Awilix
// `InjectionMode.CLASSIC`, which resolves a factory's dependencies by
// PARAMETER NAME. Every service here is written as `createXxxService(deps)`
// — ONE parameter literally named `deps` — so CLASSIC mode tries to resolve
// a cradle entry called "deps" and throws (`anter_orders`/`anter_portal`
// factories), UNLESS the registration overrides the resolver to `.proxy()`,
// which passes the whole cradle as that single argument instead. This test
// wraps each factory with `jest.fn(actual)` to capture the EXACT object it
// was called with from a REAL CLASSIC `createRequestContainer()`, and
// asserts each field is the real cradle value (not undefined) — a unit test
// that constructs the service directly (`createAnterCartService({ em })`)
// would never catch this, since it bypasses DI entirely.

jest.mock('@open-mercato/shared/lib/db/mikro', () => {
  const baseEm: any = { fork: () => baseEm }
  return {
    __esModule: true,
    getOrm: async () => ({ em: baseEm }),
    getOrmEntities: () => [],
    registerOrmEntities: () => {},
  }
})

jest.mock('@open-mercato/shared/lib/query/engine', () => ({
  __esModule: true,
  BasicQueryEngine: class {},
}))

jest.mock('@open-mercato/shared/lib/data/engine', () => ({
  __esModule: true,
  DefaultDataEngine: class {},
}))

jest.mock('@open-mercato/shared/lib/commands', () => ({
  __esModule: true,
  commandRegistry: {},
  CommandBus: class { constructor() {} },
}))

jest.mock('@open-mercato/shared/modules/overrides', () => ({
  __esModule: true,
  applyDiOverridesToContainer: () => {},
}))

jest.mock('@open-mercato/core/bootstrap', () => ({
  __esModule: true,
  bootstrap: async () => {},
}))

jest.mock('@open-mercato/shared/lib/encryption/subscriber', () => ({
  __esModule: true,
  registerTenantEncryptionSubscriber: () => {},
}))

jest.mock('../lib/pricingResolver', () => ({
  __esModule: true,
  registerAnterPartnerPricingResolver: () => {},
}))

jest.mock('../services/anterPartnerTermsService', () => {
  const actual = jest.requireActual('../services/anterPartnerTermsService')
  return { __esModule: true, ...actual, createAnterPartnerTermsService: jest.fn(actual.createAnterPartnerTermsService) }
})
jest.mock('../services/anterOrderReadService', () => {
  const actual = jest.requireActual('../services/anterOrderReadService')
  return { __esModule: true, ...actual, createAnterOrderReadService: jest.fn(actual.createAnterOrderReadService) }
})
jest.mock('../../anter_portal/services/anterCartService', () => {
  const actual = jest.requireActual('../../anter_portal/services/anterCartService')
  return { __esModule: true, ...actual, createAnterCartService: jest.fn(actual.createAnterCartService) }
})
jest.mock('../../anter_portal/services/anterCatalogService', () => {
  const actual = jest.requireActual('../../anter_portal/services/anterCatalogService')
  return { __esModule: true, ...actual, createAnterCatalogService: jest.fn(actual.createAnterCatalogService) }
})

import { asValue } from 'awilix'
import { register as registerAnterOrdersDi } from '../di'
import { register as registerAnterPortalDi } from '../../anter_portal/di'
import { createAnterPartnerTermsService } from '../services/anterPartnerTermsService'
import { createAnterOrderReadService } from '../services/anterOrderReadService'
import { createAnterCartService } from '../../anter_portal/services/anterCartService'
import { createAnterCatalogService } from '../../anter_portal/services/anterCatalogService'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'

const {
  createRequestContainer,
  registerDiRegistrars,
  resetBootstrapCache,
} = require('@open-mercato/shared/lib/di/container')

const fakeCatalogPricingService = { resolvePriceMany: async () => [] }
const fakeCache = { get: async () => null, set: async () => {}, delete: async () => {}, deleteByTags: async () => 0 }

function registerFakeCatalogPricingService(container: AppContainer) {
  container.register({ catalogPricingService: asValue(fakeCatalogPricingService), cache: asValue(fakeCache) })
}

describe('anter_orders/anter_portal DI registrations under CLASSIC injection mode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetBootstrapCache()
    registerDiRegistrars([registerFakeCatalogPricingService, registerAnterOrdersDi, registerAnterPortalDi])
  })

  it('injects the real em into anterPartnerTermsService', async () => {
    const container = await createRequestContainer()
    container.resolve('anterPartnerTermsService')
    expect(createAnterPartnerTermsService).toHaveBeenCalledTimes(1)
    const deps = (createAnterPartnerTermsService as jest.Mock).mock.calls[0][0]
    expect(deps.em).toBe(container.resolve('em'))
    expect(deps.em).toBeDefined()
  })

  it('injects the real em into anterOrderReadService', async () => {
    const container = await createRequestContainer()
    container.resolve('anterOrderReadService')
    expect(createAnterOrderReadService).toHaveBeenCalledTimes(1)
    const deps = (createAnterOrderReadService as jest.Mock).mock.calls[0][0]
    expect(deps.em).toBe(container.resolve('em'))
  })

  it('injects real em/catalogPricingService/anterPartnerTermsService into anterCatalogService', async () => {
    const container = await createRequestContainer()
    container.resolve('anterCatalogService')
    expect(createAnterCatalogService).toHaveBeenCalledTimes(1)
    const deps = (createAnterCatalogService as jest.Mock).mock.calls[0][0]
    expect(deps.em).toBe(container.resolve('em'))
    expect(deps.catalogPricingService).toBe(fakeCatalogPricingService)
    expect(typeof deps.anterPartnerTermsService?.getByCustomerEntityId).toBe('function')
  })

  it('injects the real em into anterCartService', async () => {
    const container = await createRequestContainer()
    container.resolve('anterCartService')
    expect(createAnterCartService).toHaveBeenCalledTimes(1)
    const deps = (createAnterCartService as jest.Mock).mock.calls[0][0]
    expect(deps.em).toBe(container.resolve('em'))
    expect(typeof deps.anterPartnerPricingService?.resolvePartnerPrice).toBe('function')
  })
})
