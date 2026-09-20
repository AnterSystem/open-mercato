import { resolvePortalConfiguratorMode } from '../anterConfiguratorModeService'
import { User } from '@open-mercato/core/modules/auth/data/entities'

const scope = { organizationId: 'org-1', tenantId: 'tenant-1' }

function termsService(record: { accountType: string; accountOwnerUserId: string | null } | null) {
  return { getByCustomerEntityId: jest.fn(async () => (record ? { id: 'terms-1', ...record } : null)) }
}

function makeEm(user: Partial<User> | null) {
  return { findOne: jest.fn(async () => user) } as unknown as import('@mikro-orm/postgresql').EntityManager
}

describe('resolvePortalConfiguratorMode (spec §3.7, C3)', () => {
  it('resolves full accounts to partner_priced', async () => {
    const result = await resolvePortalConfiguratorMode({
      em: makeEm(null),
      anterPartnerTermsService: termsService({ accountType: 'full', accountOwnerUserId: null }) as never,
      customerEntityId: 'customer-1',
      scope,
    })
    expect(result).toEqual({ mode: 'partner_priced' })
  })

  it('resolves hidden accounts to partner_unpriced', async () => {
    const result = await resolvePortalConfiguratorMode({
      em: makeEm(null),
      anterPartnerTermsService: termsService({ accountType: 'hidden', accountOwnerUserId: null }) as never,
      customerEntityId: 'customer-1',
      scope,
    })
    expect(result).toEqual({ mode: 'partner_unpriced' })
  })

  it('resolves missing terms to partner_priced (X1: new column defaults to full)', async () => {
    const result = await resolvePortalConfiguratorMode({
      em: makeEm(null),
      anterPartnerTermsService: termsService(null) as never,
      customerEntityId: 'customer-1',
      scope,
    })
    expect(result).toEqual({ mode: 'partner_priced' })
  })

  it('denies a preview account even though it holds portal.configurator.use, explaining who to contact', async () => {
    const owner = { name: 'Tomasz Rej', email: 'tomasz@example.com' } as User
    const result = await resolvePortalConfiguratorMode({
      em: makeEm(owner),
      anterPartnerTermsService: termsService({ accountType: 'preview', accountOwnerUserId: 'owner-1' }) as never,
      customerEntityId: 'customer-1',
      scope,
    })
    expect(result).toEqual({
      mode: 'denied',
      body: {
        error: 'configurator_unavailable',
        missing: 'account_type',
        accountType: 'preview',
        contactOwnerName: 'Tomasz Rej',
        contactOwnerEmail: 'tomasz@example.com',
      },
    })
  })

  it('denies a preview account with no assigned owner, without crashing on the lookup', async () => {
    const result = await resolvePortalConfiguratorMode({
      em: makeEm(null),
      anterPartnerTermsService: termsService({ accountType: 'preview', accountOwnerUserId: null }) as never,
      customerEntityId: 'customer-1',
      scope,
    })
    expect(result.mode).toBe('denied')
    if (result.mode === 'denied') {
      expect(result.body.contactOwnerName).toBeNull()
      expect(result.body.contactOwnerEmail).toBeNull()
    }
  })
})
