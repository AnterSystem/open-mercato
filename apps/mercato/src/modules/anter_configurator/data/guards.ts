import type { EntityManager } from '@mikro-orm/postgresql'
import type { MutationGuard } from '@open-mercato/shared/lib/crud/mutation-guard-registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { AnterOrderReadService } from '../../anter_orders/services/anterOrderReadService'
import { AnterProjectRevision } from './entities'

const ORDER_CONFIRM_ENTITY = 'anter_orders.order.confirm'

/**
 * X10 — the mutation guard that makes the priced track real (C9): a
 * configurator-sourced order stays gated at `order.confirm` until its
 * revision's technical review is accepted. Registered from
 * `anter_configurator` (never from `anter_orders`, per §3.2's "nothing
 * points back") and matched against the CONFIRM-SPECIFIC resource kind the
 * confirm route passes (`anter_orders.order.confirm`, distinct from the
 * generic `anter_orders.order` used by shipments/invoices/allocation) so
 * this guard never blocks any order mutation other than confirmation.
 *
 * Absent this module, `runMutationGuards` simply has no guard registered for
 * this resourceKind — confirm proceeds unconstrained (verified by
 * `__tests__/orderConfirmGuard.test.ts`).
 */
const technicalAcceptanceGuard: MutationGuard = {
  id: 'anter_configurator.order-confirm.technical-acceptance',
  targetEntity: ORDER_CONFIRM_ENTITY,
  operations: ['update'],
  priority: 10,

  async validate(input) {
    if (!input.resourceId) return { ok: true }

    const container = await createRequestContainer()
    let orderReadService: AnterOrderReadService | null = null
    try {
      orderReadService = container.resolve('anterOrderReadService') as AnterOrderReadService
    } catch {
      return { ok: true }
    }

    const order = await orderReadService.getSourceInfo(
      { organizationId: input.organizationId ?? '', tenantId: input.tenantId },
      input.resourceId,
    )
    if (!order || order.source !== 'configurator' || !order.configuratorRevisionId) return { ok: true }

    const em = (container.resolve('em') as EntityManager).fork()
    const revision = await em.findOne(AnterProjectRevision, { id: order.configuratorRevisionId })
    if (!revision) return { ok: true }

    if (revision.technicalAcceptanceState !== 'accepted') {
      return {
        ok: false,
        status: 422,
        body: {
          error: 'technical_acceptance_required',
          technicalAcceptanceState: revision.technicalAcceptanceState,
        },
      }
    }
    return { ok: true }
  },
}

export const guards: MutationGuard[] = [technicalAcceptanceGuard]

export default guards
