import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

// Column 1 (#4400 precedent, see customer_accounts' company-users widget):
// any column-2 group flips CrudForm into the narrow two-column layout.
const partnerCardWidget = {
  widgetId: 'anter_orders.injection.partner-card',
  kind: 'group',
  column: 1,
  groupLabel: 'anter_orders.widgets.partnerCard.title',
  priority: 210,
} as const

export const injectionTable: ModuleInjectionTable = {
  'customers.company': [partnerCardWidget],
  'crud-form:customers.company': [partnerCardWidget],
}

export default injectionTable
