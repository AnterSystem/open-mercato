import { recordOrderCrmActivity, type OrderCrmActivityPayload, type ResolverContext } from '../lib/crmActivity'

export const metadata = {
  event: 'anter_orders.order.shipped_partially',
  persistent: true,
  id: 'anter_orders:order-shipped-partially-crm-activity',
}

export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const order = payload as OrderCrmActivityPayload
  await recordOrderCrmActivity(
    ctx,
    order,
    'anter_orders.order_shipped_partially',
    `Order ${order.orderNumber} shipped partially`,
    order.shipmentNumber ? `Shipment ${order.shipmentNumber}` : undefined,
  )
}
