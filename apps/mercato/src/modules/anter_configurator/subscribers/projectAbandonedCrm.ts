import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'
import { resolveContainer, type ResolverContext } from '../lib/crmFeedback'

export const metadata = {
  event: 'anter_configurator.project.abandoned',
  persistent: true,
  id: 'anter_configurator:project-abandoned-crm',
}

type ProjectAbandonedPayload = {
  projectId: string
  customerEntityId: string | null
  valueNetAmount: number
  ageDays: number
  organizationId: string
  tenantId: string
}

/**
 * §3.12/US-3.5: a task for the account owner, carrying the project, its
 * value and its age — deliberately internal-only (no partner-facing event,
 * per the event table's own asymmetry note).
 */
export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const event = payload as ProjectAbandonedPayload
  if (!event.customerEntityId) return
  const container = resolveContainer(ctx)
  const scope = { organizationId: event.organizationId, tenantId: event.tenantId }

  const termsService = container.resolve<AnterPartnerTermsService>('anterPartnerTermsService')
  const terms = await termsService.getByCustomerEntityId(event.customerEntityId, scope)
  if (!terms?.accountOwnerUserId) return

  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('customers.interactions.create', {
    input: {
      organizationId: event.organizationId,
      tenantId: event.tenantId,
      entityId: event.customerEntityId,
      interactionType: 'task',
      title: `Abandoned configurator project (${event.ageDays} days idle)`,
      body: `Draft value: ${event.valueNetAmount}. No activity for ${event.ageDays} days.`,
      status: 'planned',
      ownerUserId: terms.accountOwnerUserId,
      scheduledAt: new Date(),
      source: 'anter_configurator',
    },
    ctx: {
      container: container as unknown as import('awilix').AwilixContainer,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: event.organizationId,
      organizationIds: [event.organizationId],
    },
  })
}
