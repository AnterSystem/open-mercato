import { createModuleEvents } from '@open-mercato/shared/modules/events'

// Spec §API Contracts "Events". `clientBroadcast` bridges to the back-office
// SSE stream, `portalBroadcast` to the partner's. `project.abandoned` is
// deliberately internal-only (an internal sales signal); `custom_item.priced`
// likewise (the partner learns of it when the offer arrives, not before).
const events = [
  { id: 'anter_configurator.project.saved', label: 'Anter Configurator Project Saved', entity: 'anter_project', category: 'lifecycle', clientBroadcast: false, portalBroadcast: false },
  { id: 'anter_configurator.quote_request.sent', label: 'Anter Configurator Quote Request Sent', entity: 'anter_submission', category: 'lifecycle', clientBroadcast: true, portalBroadcast: true },
  { id: 'anter_configurator.submission.created', label: 'Anter Configurator Submission Created', entity: 'anter_submission', category: 'lifecycle', clientBroadcast: true, portalBroadcast: true },
  { id: 'anter_configurator.submission.technically_accepted', label: 'Anter Configurator Submission Technically Accepted', entity: 'anter_submission', category: 'lifecycle', clientBroadcast: true, portalBroadcast: true },
  { id: 'anter_configurator.submission.changes_requested', label: 'Anter Configurator Submission Changes Requested', entity: 'anter_submission', category: 'lifecycle', clientBroadcast: true, portalBroadcast: true },
  { id: 'anter_configurator.submission.rejected', label: 'Anter Configurator Submission Rejected', entity: 'anter_submission', category: 'lifecycle', clientBroadcast: true, portalBroadcast: true },
  { id: 'anter_configurator.offer.issued', label: 'Anter Configurator Offer Issued', entity: 'anter_offer', category: 'lifecycle', clientBroadcast: true, portalBroadcast: true },
  { id: 'anter_configurator.offer.accepted', label: 'Anter Configurator Offer Accepted', entity: 'anter_offer', category: 'lifecycle', clientBroadcast: true, portalBroadcast: true },
  { id: 'anter_configurator.offer.expired', label: 'Anter Configurator Offer Expired', entity: 'anter_offer', category: 'lifecycle', clientBroadcast: true, portalBroadcast: true },
  { id: 'anter_configurator.project.abandoned', label: 'Anter Configurator Project Abandoned', entity: 'anter_project', category: 'lifecycle', clientBroadcast: true, portalBroadcast: false },
  { id: 'anter_configurator.custom_item.priced', label: 'Anter Configurator Custom Item Priced', entity: 'anter_custom_item', category: 'lifecycle', clientBroadcast: true, portalBroadcast: false },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'anter_configurator',
  events,
})

export const emitAnterConfiguratorEvent = eventsConfig.emit

export type AnterConfiguratorEventId = typeof events[number]['id']

export default eventsConfig
