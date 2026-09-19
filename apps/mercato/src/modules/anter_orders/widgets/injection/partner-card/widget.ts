import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import PartnerCardWidget from './widget.client'

const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'anter_orders.injection.partner-card',
    title: 'Anter Partner Card',
    description: 'Order stats and editable ordering terms for this partner (s16/s17)',
    features: ['anter_orders.view'],
    priority: 150,
    enabled: true,
  },
  Widget: PartnerCardWidget,
}

export default widget
