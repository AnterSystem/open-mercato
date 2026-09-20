import { createRequestContainer, type AppContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'

export type AnterConfiguratorCommandContext = {
  ctx: CommandRuntimeContext
  container: AppContainer
  organizationId: string
  tenantId: string
}

/**
 * Staff-auth context for `anter_configurator` command-invoking action routes
 * — mirrors `anter_orders/lib/staffCommandContext.ts` so every command route
 * in this module builds the exact same `CommandRuntimeContext` shape. Feature
 * authorization is the route's own declarative `metadata.<METHOD>.requireFeatures`.
 */
export async function resolveAnterConfiguratorCommandContext(req: Request): Promise<AnterConfiguratorCommandContext> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()

  if (!auth || !auth.tenantId) {
    throw new CrudHttpError(401, { error: translate('anter_configurator.errors.unauthorized', 'Unauthorized') })
  }

  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) {
    throw new CrudHttpError(400, { error: translate('anter_configurator.errors.organizationRequired', 'Organization context is required') })
  }

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId,
    organizationIds: scope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request: req,
  }

  return { ctx, container, organizationId, tenantId: auth.tenantId }
}

export default resolveAnterConfiguratorCommandContext
