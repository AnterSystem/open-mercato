import { createRequestContainer, type AppContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'

export type AnterOrdersCommandContext = {
  ctx: CommandRuntimeContext
  container: AppContainer
  organizationId: string
  tenantId: string
}

/**
 * Staff-auth context for `anter_orders` command-invoking action routes
 * (confirm, allocate, ...) — mirrors `planner/api/availability-weekly.ts`'s
 * local helper, generalized so every command route in this module builds the
 * exact same `CommandRuntimeContext` shape. Feature authorization itself is
 * the route's own declarative `metadata.POST.requireFeatures` (enforced by
 * the framework before the handler runs, per `packages/core/AGENTS.md` §
 * Access Control) — this helper only builds the context a route needs once
 * that gate has already passed.
 */
export async function resolveAnterOrdersCommandContext(req: Request): Promise<AnterOrdersCommandContext> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()

  if (!auth || !auth.tenantId) {
    throw new CrudHttpError(401, { error: translate('anter_orders.errors.unauthorized', 'Unauthorized') })
  }

  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) {
    throw new CrudHttpError(400, { error: translate('anter_orders.errors.organizationRequired', 'Organization context is required') })
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

export default resolveAnterOrdersCommandContext
