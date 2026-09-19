import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'anter_portal',
  events,
})

export const emitAnterPortalEvent = eventsConfig.emit

export type AnterPortalEventId = typeof events[number]['id']

export default eventsConfig
