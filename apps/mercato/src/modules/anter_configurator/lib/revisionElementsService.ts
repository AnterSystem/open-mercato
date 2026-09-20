import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { AnterProjectElement, AnterProjectRevision } from '../data/entities'
import type { AnterProjectElementInput } from '../data/validators'
import type { RevisionComputeBomResult } from '../commands/revisionComputeBom'

export type RevisionScope = { organizationId: string; tenantId: string }

/**
 * Whole-revision element replace (spec §API Contracts): removes every
 * existing element and re-creates the payload transactionally. Shared by the
 * staff (internal-mode) and portal element-replace routes so the two never
 * diverge on the id-resolution/persist shape (§3.7 rule 1 — one engine, two
 * surfaces).
 */
export async function replaceRevisionElements(
  em: EntityManager,
  revisionId: string,
  elements: AnterProjectElementInput[],
  scope: RevisionScope,
): Promise<string[]> {
  const resolvedIds = elements.map((element) => element.id ?? randomUUID())

  await withAtomicFlush(em, [
    async () => {
      const existing = await em.find(AnterProjectElement, { revisionId })
      for (const element of existing) em.remove(element)
    },
    () => {
      elements.forEach((input, index) => {
        em.persist(em.create(AnterProjectElement, {
          id: resolvedIds[index],
          revisionId,
          elementKind: input.elementKind,
          productId: input.productId ?? null,
          productVariantId: input.productVariantId ?? null,
          geometry: input.geometry,
          hostElementId: input.hostElementId ?? null,
          hostOffsetRatio: input.hostOffsetRatio != null ? String(input.hostOffsetRatio) : null,
          label: input.label ?? null,
          sortOrder: input.sortOrder,
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
        }))
      })
    },
  ], { transaction: true, label: 'anter_configurator.revision.elements.replace' })

  return resolvedIds
}

/**
 * Recomputes the BOM through the command bus (undo/audit stay intact) when
 * the revision has been calibrated. Returns `null` before calibration —
 * there is nothing authoritative to compute yet (C4).
 */
export async function computeBomIfCalibrated(
  container: AppContainer,
  ctx: CommandRuntimeContext,
  revision: AnterProjectRevision,
  scope: RevisionScope,
  currencyCode: string,
  customerEntityId: string | null,
): Promise<RevisionComputeBomResult | null> {
  if (revision.metresPerUnit == null) return null
  const commandBus = container.resolve<CommandBus>('commandBus')
  const { result } = await commandBus.execute<unknown, RevisionComputeBomResult>('anter_configurator.revision.compute_bom', {
    input: {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      revisionId: revision.id,
      currencyCode,
      customerEntityId,
    },
    ctx,
  })
  return result
}
