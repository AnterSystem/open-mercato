import { recordOrderCrmActivity, type OrderCrmActivityPayload, type ResolverContext } from '../lib/crmActivity'

export const metadata = {
  event: 'anter_orders.order.placed',
  persistent: true,
  id: 'anter_orders:order-placed-crm-activity',
}

export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const order = payload as OrderCrmActivityPayload
  await recordOrderCrmActivity(
    ctx,
    order,
    'anter_orders.order_placed',
    `Order ${order.orderNumber} placed`,
    order.grandTotalGrossAmount != null ? `Total: ${order.grandTotalGrossAmount}` : undefined,
  )
}
