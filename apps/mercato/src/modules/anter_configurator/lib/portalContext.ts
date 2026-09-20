import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer, type AppContainer } from '@open-mercato/shared/lib/di/container'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import {
  getCustomerAuthFromRequest,
  requireCustomerFeature,
  type CustomerAuthContext,
} from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'

export type AnterConfiguratorPortalContext = {
  auth: CustomerAuthContext
  customerEntityId: string
  customerUserId: string
  organizationId: string
  tenantId: string
  container: AppContainer
  em: EntityManager
}

/**
 * Resolves the authenticated, feature-checked portal caller for every
 * `anter_configurator` portal API route. Mirrors
 * `anter_portal/lib/portalContext.ts` exactly — `customer_accounts`/`portal`
 * is a hard dependency of this module too (spec §3.13), resolved directly
 * rather than through `anter_portal`, so the two peer modules never import
 * each other's auth glue. Every response is scoped to `customerEntityId`
 * from the JWT — never a request parameter (§3.14).
 */
export async function resolveAnterConfiguratorPortalContext(
  req: Request,
  requiredFeatures: string[],
): Promise<AnterConfiguratorPortalContext | Response> {
  const auth = await getCustomerAuthFromRequest(req)
  if (!auth) {
    const { translate } = await resolveTranslations()
    return NextResponse.json(
      { error: translate('anter_configurator.errors.unauthorized', 'Unauthorized') },
      { status: 401 },
    )
  }
  if (!auth.customerEntityId) {
    const { translate } = await resolveTranslations()
    return NextResponse.json(
      { error: translate('anter_configurator.errors.notLinked', 'Customer account is not linked to a partner record') },
      { status: 403 },
    )
  }

  const container = await createRequestContainer()
  const rbac = container.resolve('customerRbacService') as CustomerRbacService
  try {
    await requireCustomerFeature(auth, requiredFeatures, rbac)
  } catch (response) {
    return response as NextResponse
  }

  const em = container.resolve('em') as EntityManager
  return {
    auth,
    customerEntityId: auth.customerEntityId,
    customerUserId: auth.sub,
    organizationId: auth.orgId,
    tenantId: auth.tenantId,
    container,
    em,
  }
}

export default resolveAnterConfiguratorPortalContext
