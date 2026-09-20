import type { EntityManager } from '@mikro-orm/postgresql'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import type { AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'

export type AnterConfiguratorMode = 'internal' | 'partner_priced' | 'partner_unpriced' | 'denied'

export type AnterConfiguratorDeniedBody = {
  error: 'configurator_unavailable'
  missing: 'account_type'
  accountType: string
  contactOwnerName: string | null
  contactOwnerEmail: string | null
}

export type AnterConfiguratorPortalModeResolution =
  | { mode: 'partner_priced' }
  | { mode: 'partner_unpriced' }
  | { mode: 'denied'; body: AnterConfiguratorDeniedBody }

export type AnterConfiguratorModeScope = { organizationId: string; tenantId: string }

/**
 * Mode is computed once per request from the caller's identity and never
 * requested (spec §3.7, C3 — there is no `?mode=` anywhere in the API).
 * `internal` is resolved declaratively by the staff route's own
 * `requireFeatures: ['anter_configurator.internal']` metadata guard — this
 * service only carries the interesting resolution: `preview` accounts are
 * `denied`, explained rather than blank (s12's principle — a named
 * restriction, not a greyed-out field), even when the caller still holds
 * `portal.configurator.use` (that feature answers "may this identity ever
 * draw", not "does this partner's contract allow it" — the terms win).
 */
export async function resolvePortalConfiguratorMode(input: {
  em: EntityManager
  anterPartnerTermsService: AnterPartnerTermsService
  customerEntityId: string
  scope: AnterConfiguratorModeScope
}): Promise<AnterConfiguratorPortalModeResolution> {
  const terms = await input.anterPartnerTermsService.getByCustomerEntityId(input.customerEntityId, input.scope)
  const accountType = terms?.accountType ?? 'full'

  if (accountType === 'preview') {
    const owner = terms?.accountOwnerUserId
      ? await input.em.findOne(User, { id: terms.accountOwnerUserId })
      : null
    return {
      mode: 'denied',
      body: {
        error: 'configurator_unavailable',
        missing: 'account_type',
        accountType,
        contactOwnerName: owner?.name ?? null,
        contactOwnerEmail: owner?.email ?? null,
      },
    }
  }

  return { mode: accountType === 'hidden' ? 'partner_unpriced' : 'partner_priced' }
}
