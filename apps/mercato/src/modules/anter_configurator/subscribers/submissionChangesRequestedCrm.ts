import { recordAnterConfiguratorActivity, resolveContainer, type ResolverContext } from '../lib/crmFeedback'

export const metadata = {
  event: 'anter_configurator.submission.changes_requested',
  persistent: true,
  id: 'anter_configurator:submission-changes-requested-crm',
}

type ChangesRequestedPayload = {
  reason: string
  customerEntityId: string | null
  organizationId: string
  tenantId: string
}

/** §3.12: commercial — the partner is waiting on Anter; the account owner should know. */
export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const event = payload as ChangesRequestedPayload
  if (!event.customerEntityId) return
  const container = resolveContainer(ctx)
  await recordAnterConfiguratorActivity(container, { organizationId: event.organizationId, tenantId: event.tenantId }, {
    customerEntityId: event.customerEntityId,
    interactionType: 'anter_configurator.submission_changes_requested',
    title: 'Technical review requested changes',
    body: event.reason,
  })
}
