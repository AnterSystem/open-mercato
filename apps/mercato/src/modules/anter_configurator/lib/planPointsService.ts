import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { AnterPlanPoint, AnterProjectElement, AnterProjectRevision } from '../data/entities'
import type { AnterPlanPointInput } from '../data/validators'
import { findNearestCoverageDistanceM, type Vertex } from '../services/anterGeometryService'

export type PlanPointView = {
  id: string
  pointKind: string
  position: Vertex
  state: string
  skipReason: string | null
  coverageRadiusM: number
}

function collectElementVertices(elements: AnterProjectElement[]): Vertex[] {
  const vertices: Vertex[] = []
  for (const element of elements) {
    const geometry = element.geometry as { vertices?: Vertex[]; position?: Vertex }
    if (Array.isArray(geometry.vertices)) vertices.push(...geometry.vertices)
    if (geometry.position) vertices.push(geometry.position)
  }
  return vertices
}

/**
 * Declares plan points and computes their coverage (spec §3.15, C12 — points
 * are entered, not detected; coverage IS computed). A point is `covered`
 * when any drawn element lies within its `coverageRadiusM`, `skipped` when
 * the caller dismissed it with a reason, `open` otherwise.
 */
export async function replaceRevisionPlanPoints(
  em: EntityManager,
  revision: AnterProjectRevision,
  points: AnterPlanPointInput[],
  scope: { organizationId: string; tenantId: string },
): Promise<PlanPointView[]> {
  const elements = await em.find(AnterProjectElement, { revisionId: revision.id })
  const candidateVertices = collectElementVertices(elements)
  const metresPerUnit = revision.metresPerUnit != null ? Number(revision.metresPerUnit) : null

  const results: PlanPointView[] = []
  await withAtomicFlush(em, [
    async () => {
      const existing = await em.find(AnterPlanPoint, { revisionId: revision.id })
      for (const point of existing) em.remove(point)
    },
    () => {
      for (const input of points) {
        const distanceM = metresPerUnit != null ? findNearestCoverageDistanceM(input.position, candidateVertices, metresPerUnit) : null
        const state = input.skipReason
          ? 'skipped'
          : distanceM != null && distanceM <= input.coverageRadiusM
            ? 'covered'
            : 'open'

        const persisted = em.create(AnterPlanPoint, {
          id: input.id ?? randomUUID(),
          revisionId: revision.id,
          pointKind: input.pointKind,
          position: input.position,
          state,
          skipReason: input.skipReason ?? null,
          coverageRadiusM: String(input.coverageRadiusM),
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
        })
        em.persist(persisted)
        results.push({
          id: persisted.id,
          pointKind: persisted.pointKind,
          position: persisted.position,
          state: persisted.state,
          skipReason: persisted.skipReason ?? null,
          coverageRadiusM: Number(persisted.coverageRadiusM),
        })
      }
    },
  ], { transaction: true, label: 'anter_configurator.revision.points.replace' })

  return results
}
