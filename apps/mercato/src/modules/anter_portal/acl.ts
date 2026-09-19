export const features = [
  { id: 'portal.catalog.view', title: 'View Anter catalogue', module: 'anter_portal' },
  { id: 'portal.orders.view', title: 'View own Anter orders', module: 'anter_portal' },
  {
    id: 'portal.orders.create',
    title: 'Place Anter orders',
    module: 'anter_portal',
    dependsOn: ['portal.orders.view'],
  },
]

export default features
