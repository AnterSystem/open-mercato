import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'anter_demo',
  title: 'Anter Demo Data',
  version: '0.1.0',
  description:
    'Reproducible demo dataset for the Anter ordering flow: the product catalogue derived from the source spreadsheet, the partner company and its contacts, portal logins, and partner terms, stock, orders, shipments and invoices.',
  author: 'Anter',
  license: 'UNLICENSED',
  requires: ['catalog', 'customers', 'customer_accounts', 'anter_orders', 'anter_portal', 'anter_configurator'],
}

export default metadata
