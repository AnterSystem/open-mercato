import type { AwilixContainer } from 'awilix'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { invalidateAnterPartnerStatsCache, resolveCache } from './cache'

const logger = createLogger('anter_orders').child({ component: 'crmActivity' })

export type ResolverContainer = { resolve: <T = unknown>(name: string) => T }
export type ResolverContext = ResolverContainer & { container?: ResolverContainer }

function resolveContainer(ctx: ResolverContext): ResolverContainer {
  return ctx.container ?? { resolve: ctx.resolve }
}

export type OrderCrmActivityPayload = {
  id: string
  orderNumber: string
  customerEntityId: string
  organizationId: string
  tenantId: string
  grandTotalNetAmount?: number
  grandTotalGrossAmount?: number
  shipmentNumber?: string
}

/**
 * Writes a CRM activity onto the partner company through `customers`' public
 * command API — never by direct entity access (spec §3.8: "Subscribers in
 * `anter_orders` listen to its own events and write to `customers` through
 * that module's public API"). `customers.interactions.create` is the
 * current, non-deprecated mechanism (its `customers.activities.create`
 * predecessor is a compatibility shim over the same command).
 *
 * `auth: null` — persistent subscribers run without an authenticated staff
 * actor; `ensureTenantScope`/`ensureOrganizationScope` inside the command
 * both no-op when `ctx.auth` is absent (see `anter_orders.order.place`'s own
 * checkout-orchestration comment for the same reasoning).
 */
export async function recordOrderCrmActivity(
  ctx: ResolverContext,
  payload: OrderCrmActivityPayload,
  interactionType: string,
  title: string,
  body?: string,
): Promise<void> {
  try {
    const container = resolveContainer(ctx)
    const commandBus = container.resolve<CommandBus>('commandBus')
    const commandCtx: CommandRuntimeContext = {
      container: container as unknown as AwilixContainer,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: payload.organizationId,
      organizationIds: [payload.organizationId],
    }
    await commandBus.execute('customers.interactions.create', {
      input: {
        organizationId: payload.organizationId,
        tenantId: payload.tenantId,
        entityId: payload.customerEntityId,
        interactionType,
        title,
        body: body ?? null,
        status: 'completed',
        occurredAt: new Date(),
        source: 'anter_orders',
      },
      ctx: commandCtx,
    })
    await invalidateAnterPartnerStatsCache(resolveCache(container), payload.organizationId, payload.customerEntityId)
  } catch (err) {
    // §Edge Cases "CRM write fails after placement": the order stands, the
    // event is not lost (persistent subscribers retry), only late — this
    // path must never throw back into the event bus and roll anything back.
    logger.warn('[internal] failed to record CRM activity for anter_orders order event', {
      orderId: payload.id,
      interactionType,
      err,
    })
    throw err
  }
}

export default recordOrderCrmActivity
