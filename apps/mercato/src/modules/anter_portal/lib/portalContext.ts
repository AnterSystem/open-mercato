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

export type PortalContext = {
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
 * `anter_portal` API route (spec §3.10 — per-method `requireCustomerAuth` /
 * `requireCustomerFeatures`, enforced here rather than via page metadata
 * because these are API routes, not pages). Every response is scoped to
 * `customerEntityId` from the JWT — never a request parameter (§3.10).
 */
export async function resolveAnterPortalContext(
  req: Request,
  requiredFeatures: string[],
): Promise<PortalContext | Response> {
  const auth = await getCustomerAuthFromRequest(req)
  if (!auth) {
    const { translate } = await resolveTranslations()
    return NextResponse.json(
      { error: translate('anter_portal.errors.unauthorized', 'Unauthorized') },
      { status: 401 },
    )
  }
  if (!auth.customerEntityId) {
    const { translate } = await resolveTranslations()
    return NextResponse.json(
      { error: translate('anter_portal.errors.notLinked', 'Customer account is not linked to a partner record') },
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

export default resolveAnterPortalContext
