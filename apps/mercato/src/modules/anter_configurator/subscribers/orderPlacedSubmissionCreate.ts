import type { AwilixContainer } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { AnterProjectRevision } from '../data/entities'

const logger = createLogger('anter_configurator').child({ component: 'subscribers.orderPlacedSubmissionCreate' })

export const metadata = {
  event: 'anter_orders.order.placed',
  persistent: true,
  id: 'anter_configurator:order-placed-submission-create',
}

type OrderPlacedPayload = {
  id: string
  organizationId: string
  tenantId: string
  source?: string
  configuratorRevisionId?: string | null
}

type ResolverContainer = { resolve: <T = unknown>(name: string) => T }
type ResolverContext = ResolverContainer & { container?: ResolverContainer }

function resolveContainer(ctx: ResolverContext): ResolverContainer {
  return ctx.container ?? { resolve: ctx.resolve }
}

/**
 * `anter_orders → anter_configurator` is the ONLY direction of coupling the
 * spec allows (§3.2 "nothing points back"): this subscriber lives in
 * `anter_configurator`, listening to `anter_orders`' own event, never the
 * reverse. It is what makes the "priced track" real (C9) — a configurator
 * order is `placed` immediately, but confirming it is gated by a technical
 * review submission that this handler opens the moment the order exists.
 */
export default async function handle(payload: unknown, ctx: ResolverContext): Promise<void> {
  const order = payload as OrderPlacedPayload
  if (order.source !== 'configurator' || !order.configuratorRevisionId) return

  const container = resolveContainer(ctx)
  const em = (container.resolve('em') as EntityManager).fork()
  const revision = await em.findOne(AnterProjectRevision, { id: order.configuratorRevisionId })
  if (!revision) {
    logger.warn('[internal] configurator-sourced order references a missing revision', { orderId: order.id, revisionId: order.configuratorRevisionId })
    return
  }
  // Idempotent under redelivery: a revision only submits once (submissionCreate
  // itself refuses a non-draft revision), so a retried event is a silent no-op.
  if (revision.state !== 'draft') return

  const commandBus = container.resolve<CommandBus>('commandBus')
  const commandCtx: CommandRuntimeContext = {
    container: container as unknown as AwilixContainer,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: order.organizationId,
    organizationIds: [order.organizationId],
  }

  try {
    await commandBus.execute('anter_configurator.submission.create', {
      input: {
        organizationId: order.organizationId,
        tenantId: order.tenantId,
        projectId: revision.projectId,
        revisionId: revision.id,
        track: 'priced',
        resultingOrderId: order.id,
      },
      ctx: commandCtx,
    })
  } catch (err) {
    logger.warn('[internal] failed to open a technical-review submission for a placed configurator order', { orderId: order.id, err })
    throw err
  }
}
