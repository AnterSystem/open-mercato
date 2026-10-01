import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedAnterDemoData } from './lib/seeds'

export const setup: ModuleSetupConfig = {
  // Demo content only — gated behind `mercato init` without --no-examples.
  seedExamples: async (ctx) => {
    await seedAnterDemoData(ctx.em, ctx.container, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
  },
}

export default setup
