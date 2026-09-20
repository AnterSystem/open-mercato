import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { ModuleConfigService } from '@open-mercato/core/modules/configs/lib/module-config-service'

const MODULE_ID = 'anter_configurator'

export const DEFAULT_ABANDONED_AFTER_DAYS = 14
export const DEFAULT_ABANDONED_MIN_VALUE = 10000
export const DEFAULT_OFFER_VALID_DAYS = 30

export type AnterConfiguratorTenantScope = { tenantId: string; organizationId?: string | null }

function resolveModuleConfigService(container: AppContainer): ModuleConfigService | null {
  try {
    return container.resolve<ModuleConfigService>('moduleConfigService')
  } catch {
    return null
  }
}

/**
 * §3.12's "configurable, not hardcoded" abandonment thresholds. Falls back to
 * the documented defaults when `configs` is absent or the tenant never set
 * one — never throws, since a missing config module must not block the
 * abandonment worker's daily tick.
 */
export async function getAbandonmentThresholds(
  container: AppContainer,
  scope: AnterConfiguratorTenantScope,
): Promise<{ abandonedAfterDays: number; abandonedMinValue: number }> {
  const service = resolveModuleConfigService(container)
  if (!service) return { abandonedAfterDays: DEFAULT_ABANDONED_AFTER_DAYS, abandonedMinValue: DEFAULT_ABANDONED_MIN_VALUE }

  const [afterDays, minValue] = await Promise.all([
    service.getValue<number>(MODULE_ID, 'abandonedAfterDays', { defaultValue: DEFAULT_ABANDONED_AFTER_DAYS, scope: { tenantId: scope.tenantId } }),
    service.getValue<number>(MODULE_ID, 'abandonedMinValue', { defaultValue: DEFAULT_ABANDONED_MIN_VALUE, scope: { tenantId: scope.tenantId } }),
  ])
  return {
    abandonedAfterDays: afterDays ?? DEFAULT_ABANDONED_AFTER_DAYS,
    abandonedMinValue: minValue ?? DEFAULT_ABANDONED_MIN_VALUE,
  }
}
