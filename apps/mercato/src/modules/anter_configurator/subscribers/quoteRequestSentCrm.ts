import type { EntityManager } from '@mikro-orm/postgresql'
import type { AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'
import { createDealForPartner, findOpenDealId, recordAnterConfiguratorActivity, resolveContainer, type ResolverContext } from '../lib/crmFeedback'

export const metadata = {
  event: 'anter_configurator.quote_request.sent',
  persistent: true,
  id: 'anter_configurator:quote-request-sent-crm',
}

type QuoteRequestSentPayload = {
  submissionNumber: string
  customerEntityId: string
  organizationId: string
  tenantId: string
}

/**
 * §3.12: a commercial event — activity on the partner company AND, when the
 * partner has no open deal, a new deal assigned to the account owner
 * (US-3.5's onward hook: the partner shouldn't need to already have a deal
 * for staff to see this quote request tracked commercially).
 */
export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const event = payload as QuoteRequestSentPayload
  const container = resolveContainer(ctx)
  const scope = { organizationId: event.organizationId, tenantId: event.tenantId }

  const em = (container.resolve('em') as EntityManager).fork()
  let dealId = await findOpenDealId(em, scope, event.customerEntityId)

  if (!dealId) {
    const termsService = container.resolve<AnterPartnerTermsService>('anterPartnerTermsService')
    const terms = await termsService.getByCustomerEntityId(event.customerEntityId, scope)
    dealId = await createDealForPartner(container, scope, {
      customerEntityId: event.customerEntityId,
      title: `Configurator quote request ${event.submissionNumber}`,
      ownerUserId: terms?.accountOwnerUserId ?? null,
    })
  }

  await recordAnterConfiguratorActivity(container, scope, {
    customerEntityId: event.customerEntityId,
    dealId,
    interactionType: 'anter_configurator.quote_request_sent',
    title: `Quote request ${event.submissionNumber} sent`,
  })
}
