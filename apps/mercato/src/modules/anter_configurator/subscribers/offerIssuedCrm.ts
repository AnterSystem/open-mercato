import { recordAnterConfiguratorActivity, resolveContainer, type ResolverContext } from '../lib/crmFeedback'

export const metadata = {
  event: 'anter_configurator.offer.issued',
  persistent: true,
  id: 'anter_configurator:offer-issued-crm',
}

type OfferIssuedPayload = {
  offerNumber: string
  customerEntityId: string | null
  customerDealId: string | null
  grandTotalGrossAmount: number
  validUntil: string
  organizationId: string
  tenantId: string
}

/** §3.12: commercial — activity carrying offer number, value and validity. */
export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const event = payload as OfferIssuedPayload
  if (!event.customerEntityId) return
  const container = resolveContainer(ctx)
  await recordAnterConfiguratorActivity(container, { organizationId: event.organizationId, tenantId: event.tenantId }, {
    customerEntityId: event.customerEntityId,
    dealId: event.customerDealId,
    interactionType: 'anter_configurator.offer_issued',
    title: `Offer ${event.offerNumber} issued`,
    body: `Total: ${event.grandTotalGrossAmount}. Valid until: ${event.validUntil}.`,
  })
}
