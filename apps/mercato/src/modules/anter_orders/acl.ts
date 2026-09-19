export const features = [
  { id: 'anter_orders.view', title: 'View Anter orders', module: 'anter_orders' },
  {
    id: 'anter_orders.manage',
    title: 'Manage Anter orders',
    module: 'anter_orders',
    dependsOn: ['anter_orders.view'],
  },
  {
    id: 'anter_orders.fulfil',
    title: 'Fulfil Anter orders',
    module: 'anter_orders',
    dependsOn: ['anter_orders.view'],
  },
  {
    id: 'anter_orders.release',
    title: 'Release Anter orders to shipping',
    module: 'anter_orders',
    dependsOn: ['anter_orders.view'],
  },
  {
    id: 'anter_orders.terms.manage',
    title: 'Manage Anter partner terms and pricing',
    module: 'anter_orders',
    dependsOn: ['anter_orders.view'],
  },
]

export default features
