import { recordOrderCrmActivity, type OrderCrmActivityPayload, type ResolverContext } from '../lib/crmActivity'

export const metadata = {
  event: 'anter_orders.order.shipped',
  persistent: true,
  id: 'anter_orders:order-shipped-crm-activity',
}

export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const order = payload as OrderCrmActivityPayload
  await recordOrderCrmActivity(
    ctx,
    order,
    'anter_orders.order_shipped',
    `Order ${order.orderNumber} shipped`,
    order.shipmentNumber ? `Shipment ${order.shipmentNumber}` : undefined,
  )
}
