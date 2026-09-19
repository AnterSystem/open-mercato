import { recordOrderCrmActivity, type OrderCrmActivityPayload, type ResolverContext } from '../lib/crmActivity'

// Nothing in this scope currently transitions an order to `delivered` (no
// delivery-confirmation command exists yet — see `.ai/specs/2026-09-19-
// anter-catalogue-ordering-end-to-end.md` §3.6). Wired anyway per §3.8's CRM
// feedback table, so the activity fires the moment that transition lands.
export const metadata = {
  event: 'anter_orders.order.delivered',
  persistent: true,
  id: 'anter_orders:order-delivered-crm-activity',
}

export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const order = payload as OrderCrmActivityPayload
  await recordOrderCrmActivity(ctx, order, 'anter_orders.order_delivered', `Order ${order.orderNumber} delivered`)
}
