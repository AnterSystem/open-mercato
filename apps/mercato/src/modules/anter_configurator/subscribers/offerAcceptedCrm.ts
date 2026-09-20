import { advanceDealToWon, recordAnterConfiguratorActivity, resolveContainer, type ResolverContext } from '../lib/crmFeedback'

export const metadata = {
  event: 'anter_configurator.offer.accepted',
  persistent: true,
  id: 'anter_configurator:offer-accepted-crm',
}

type OfferAcceptedPayload = {
  orderNumber: string
  customerEntityId: string | null
  customerDealId: string | null
  organizationId: string
  tenantId: string
}

/** §3.12: commercial — activity, and the deal advances to the "won" stage. */
export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const event = payload as OfferAcceptedPayload
  if (!event.customerEntityId) return
  const container = resolveContainer(ctx)
  const scope = { organizationId: event.organizationId, tenantId: event.tenantId }

  await recordAnterConfiguratorActivity(container, scope, {
    customerEntityId: event.customerEntityId,
    dealId: event.customerDealId,
    interactionType: 'anter_configurator.offer_accepted',
    title: `Offer accepted — order ${event.orderNumber} placed`,
  })

  if (event.customerDealId) {
    await advanceDealToWon(container, scope, event.customerDealId)
  }
}
