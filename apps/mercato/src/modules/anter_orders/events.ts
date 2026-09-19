import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  {
    id: 'anter_orders.order.placed',
    label: 'Anter Order Placed',
    entity: 'anter_order',
    category: 'lifecycle',
    clientBroadcast: true,
    portalBroadcast: true,
  },
  {
    id: 'anter_orders.order.shipped_partially',
    label: 'Anter Order Shipped Partially',
    entity: 'anter_order',
    category: 'lifecycle',
    clientBroadcast: true,
    portalBroadcast: true,
  },
  {
    id: 'anter_orders.order.shipped',
    label: 'Anter Order Shipped',
    entity: 'anter_order',
    category: 'lifecycle',
    clientBroadcast: true,
    portalBroadcast: true,
  },
  {
    id: 'anter_orders.order.delivered',
    label: 'Anter Order Delivered',
    entity: 'anter_order',
    category: 'lifecycle',
    clientBroadcast: true,
    portalBroadcast: true,
  },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'anter_orders',
  events,
})

export const emitAnterOrdersEvent = eventsConfig.emit

export type AnterOrdersEventId = typeof events[number]['id']

export default eventsConfig
