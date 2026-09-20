import type { AwilixContainer } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { CustomerDeal, CustomerDealCompanyLink } from '@open-mercato/core/modules/customers/data/entities'
import { isOpenDealStatus } from '@open-mercato/core/modules/customers/lib/dealStatus'

const logger = createLogger('anter_configurator').child({ component: 'lib.crmFeedback' })

export type CrmScope = { organizationId: string; tenantId: string }

export type ResolverContainer = { resolve: <T = unknown>(name: string) => T }
export type ResolverContext = ResolverContainer & { container?: ResolverContainer }

export function resolveContainer(ctx: ResolverContext): ResolverContainer {
  return ctx.container ?? { resolve: ctx.resolve }
}

function buildCommandCtx(container: ResolverContainer, scope: CrmScope): CommandRuntimeContext {
  return {
    container: container as unknown as AwilixContainer,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
  }
}

/**
 * Writes a CRM activity through `customers`' public command API — never by
 * entity access (spec §3.12, mirroring the constraint `anter_orders/lib/
 * crmActivity.ts` already fixed for orders). `auth: null` because persistent
 * subscribers run with no authenticated staff actor.
 */
export async function recordAnterConfiguratorActivity(
  container: ResolverContainer,
  scope: CrmScope,
  params: { customerEntityId: string; dealId?: string | null; interactionType: string; title: string; body?: string },
): Promise<void> {
  try {
    const commandBus = container.resolve<CommandBus>('commandBus')
    await commandBus.execute('customers.interactions.create', {
      input: {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        entityId: params.customerEntityId,
        dealId: params.dealId ?? null,
        interactionType: params.interactionType,
        title: params.title,
        body: params.body ?? null,
        status: 'completed',
        occurredAt: new Date(),
        source: 'anter_configurator',
      },
      ctx: buildCommandCtx(container, scope),
    })
  } catch (err) {
    // §Edge Cases: a CRM write failure must never roll back the configurator
    // event that triggered it — this only ever runs from a persistent
    // subscriber, which retries independently of the domain write.
    logger.warn('[internal] failed to record a CRM activity for an anter_configurator event', { interactionType: params.interactionType, err })
    throw err
  }
}

/**
 * Read-only lookup — no public `customers` service exposes "does this
 * company have an open deal", so this queries the link/deal tables directly
 * (never a write). Kept narrow: id + status only, classified via the
 * public `isOpenDealStatus` helper rather than a hand-rolled status list.
 */
export async function findOpenDealId(em: EntityManager, scope: CrmScope, customerEntityId: string): Promise<string | null> {
  const links = await em.find(CustomerDealCompanyLink, {
    company: customerEntityId,
  }, { populate: ['deal'] })
  for (const link of links) {
    const deal = link.deal
    if (deal.organizationId !== scope.organizationId || deal.tenantId !== scope.tenantId) continue
    if (isOpenDealStatus(deal.status)) return deal.id
  }
  return null
}

export async function createDealForPartner(
  container: ResolverContainer,
  scope: CrmScope,
  params: { customerEntityId: string; title: string; ownerUserId?: string | null },
): Promise<string | null> {
  try {
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, { id: string }>('customers.deals.create', {
      input: {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        title: params.title,
        source: 'anter_configurator',
        ownerUserId: params.ownerUserId ?? null,
        companyIds: [params.customerEntityId],
      },
      ctx: buildCommandCtx(container, scope),
    })
    return result.id
  } catch (err) {
    logger.warn('[internal] failed to create a CRM deal for an anter_configurator event', { customerEntityId: params.customerEntityId, err })
    return null
  }
}

export async function advanceDealToWon(container: ResolverContainer, scope: CrmScope, dealId: string): Promise<void> {
  try {
    const commandBus = container.resolve<CommandBus>('commandBus')
    await commandBus.execute('customers.deals.update', {
      input: { organizationId: scope.organizationId, tenantId: scope.tenantId, id: dealId, status: 'won', closureOutcome: 'won' },
      ctx: buildCommandCtx(container, scope),
    })
  } catch (err) {
    logger.warn('[internal] failed to advance a CRM deal to won', { dealId, err })
  }
}
