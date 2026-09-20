import {
  AnterGeometryError,
  deriveAnchorCount,
  derivePostCount,
  fitModules,
  isClosedLoop,
  polylineLengthUnits,
  round4,
  splitRunAtInserts,
  type ModuleFitPolicy,
  type Vertex,
} from './anterGeometryService'

/**
 * Geometry → BOM derivation (spec §3.5, Implementation Plan step 5). Pure —
 * no DB access, no pricing — so it can be fixture-tested identically to the
 * client's reimplementation (C4). SKU → product-id resolution and pricing
 * happen one layer up, in the command that orchestrates this against the
 * database (`commands/revisionComputeBom.ts`).
 */

export type AnterProductGeometry = {
  productId: string
  productVariantId: string | null
  drawingKind: 'line' | 'point' | 'insert' | 'none'
  moduleLengthM: number | null
  moduleFitPolicy: ModuleFitPolicy
  postSku: string | null
  postsPerRunExtra: number
  anchorSku: string | null
  anchorsPerPost: number
  insertClearWidthM: number | null
}

export type AnterBomElement =
  | {
      id: string
      elementKind: 'run'
      productId: string
      productVariantId: string | null
      vertices: Vertex[]
    }
  | {
      id: string
      elementKind: 'point'
      productId: string
      productVariantId: string | null
      position: Vertex
    }
  | {
      id: string
      elementKind: 'insert'
      productId: string
      productVariantId: string | null
      position: Vertex
      hostElementId: string
      hostOffsetRatio: number
    }
  | {
      id: string
      elementKind: 'annotation'
      productId: null
      productVariantId: null
    }

export type AnterBomComputeInput = {
  elements: AnterBomElement[]
  metresPerUnit: number
  /** Keyed by `productId`. */
  productGeometryByProductId: Record<string, AnterProductGeometry>
}

export type AnterDrawnBomLineDraft = {
  origin: 'drawn'
  productId: string
  productVariantId: string | null
  sourceElementIds: string[]
  quantity: number
  unitCode: 'pcs'
  realisedLengthM: number | null
  residualLengthM: number | null
  moduleCount: number | null
  postCount: number | null
  anchorCount: number | null
}

export type AnterDerivedBomLineDraft = {
  origin: 'derived'
  sku: string
  sourceElementIds: string[]
  quantity: number
  unitCode: 'pcs'
}

export type AnterBomComputeResult = {
  drawnLines: AnterDrawnBomLineDraft[]
  derivedLines: AnterDerivedBomLineDraft[]
}

function requireProductGeometry(
  productId: string,
  byId: Record<string, AnterProductGeometry>,
): AnterProductGeometry {
  const geometry = byId[productId]
  if (!geometry) {
    throw new AnterGeometryError('product_geometry_missing', `[internal] no geometry fields for product ${productId}`)
  }
  return geometry
}

function vertexKey(vertex: Vertex): string {
  return `${round4(vertex[0])}:${round4(vertex[1])}`
}

type RunAggregate = {
  productId: string
  productVariantId: string | null
  sourceElementIds: Set<string>
  moduleCount: number
  realisedLengthM: number
  residualLengthM: number
  rawPostCount: number
}

type EndpointContribution = { vertex: Vertex; productId: string; elementId: string }

export function computeAnterBom(input: AnterBomComputeInput): AnterBomComputeResult {
  const { elements, metresPerUnit, productGeometryByProductId } = input

  const insertsByHostId = new Map<string, Array<Extract<AnterBomElement, { elementKind: 'insert' }>>>()
  for (const element of elements) {
    if (element.elementKind === 'insert') {
      const list = insertsByHostId.get(element.hostElementId) ?? []
      list.push(element)
      insertsByHostId.set(element.hostElementId, list)
    }
  }

  const runAggregates = new Map<string, RunAggregate>()
  const endpointContributions: EndpointContribution[] = []
  const pointCounts = new Map<string, { productId: string; productVariantId: string | null; quantity: number; sourceElementIds: Set<string> }>()

  for (const element of elements) {
    if (element.elementKind === 'run') {
      const geometry = requireProductGeometry(element.productId, productGeometryByProductId)
      if (geometry.moduleLengthM == null) {
        throw new AnterGeometryError('module_length_missing', `[internal] product ${element.productId} has no module length`)
      }
      const lengthUnits = polylineLengthUnits(element.vertices)
      const lengthM = lengthUnits * metresPerUnit
      const closedLoop = isClosedLoop(element.vertices)

      const inserts = (insertsByHostId.get(element.id) ?? []).map((insert) => {
        const insertGeometry = requireProductGeometry(insert.productId, productGeometryByProductId)
        if (insertGeometry.insertClearWidthM == null) {
          throw new AnterGeometryError('insert_clear_width_missing', `[internal] insert product ${insert.productId} has no clear width`)
        }
        return { id: insert.id, hostOffsetRatio: insert.hostOffsetRatio, clearWidthM: insertGeometry.insertClearWidthM }
      })

      const segments = inserts.length > 0
        ? splitRunAtInserts(lengthM, inserts)
        : [{ lengthM: round4(lengthM), precedingInsertId: null, followingInsertId: null }]

      // A run is only a true "closed loop" (no `+1`) when it is a single,
      // unsplit segment whose own first/last vertex coincide — an insert cut
      // gives every resulting segment two real open ends.
      const runIsClosedSingleSegment = closedLoop && segments.length === 1

      const key = `${element.productId}:${element.productVariantId ?? ''}`
      const aggregate = runAggregates.get(key) ?? {
        productId: element.productId,
        productVariantId: element.productVariantId,
        sourceElementIds: new Set<string>(),
        moduleCount: 0,
        realisedLengthM: 0,
        residualLengthM: 0,
        rawPostCount: 0,
      }
      aggregate.sourceElementIds.add(element.id)

      for (const segment of segments) {
        const fit = fitModules(segment.lengthM, geometry.moduleLengthM, geometry.moduleFitPolicy)
        aggregate.moduleCount += fit.moduleCount
        aggregate.realisedLengthM = round4(aggregate.realisedLengthM + fit.realisedLengthM)
        aggregate.residualLengthM = round4(aggregate.residualLengthM + fit.residualLengthM)
        aggregate.rawPostCount += derivePostCount(fit.moduleCount, geometry.postsPerRunExtra, runIsClosedSingleSegment)
      }
      runAggregates.set(key, aggregate)

      // Only a run's own true open ends (never present on a closed loop, and
      // never an insert-split boundary — that boundary belongs to the insert,
      // not to another run) are eligible for the same-product shared-vertex
      // dedup (spec §3.5 step 3).
      if (!closedLoop) {
        const first = element.vertices[0]
        const last = element.vertices[element.vertices.length - 1]
        endpointContributions.push({ vertex: first, productId: element.productId, elementId: element.id })
        endpointContributions.push({ vertex: last, productId: element.productId, elementId: element.id })
      }
    } else if (element.elementKind === 'point' || element.elementKind === 'insert') {
      requireProductGeometry(element.productId, productGeometryByProductId)
      const key = `${element.productId}:${element.productVariantId ?? ''}`
      const entry = pointCounts.get(key) ?? {
        productId: element.productId,
        productVariantId: element.productVariantId,
        quantity: 0,
        sourceElementIds: new Set<string>(),
      }
      entry.quantity += 1
      entry.sourceElementIds.add(element.id)
      pointCounts.set(key, entry)
    }
  }

  // Shared-vertex post dedup: group endpoint contributions by (vertex,
  // product); any group of 2+ shares one physical post, so only the first
  // counts (spec: "Posts at a shared vertex between two segments of the same
  // product are counted once").
  const dedupByProduct = new Map<string, number>()
  const byVertexAndProduct = new Map<string, EndpointContribution[]>()
  for (const contribution of endpointContributions) {
    const key = `${vertexKey(contribution.vertex)}::${contribution.productId}`
    const list = byVertexAndProduct.get(key) ?? []
    list.push(contribution)
    byVertexAndProduct.set(key, list)
  }
  for (const [key, group] of byVertexAndProduct) {
    if (group.length > 1) {
      const productId = key.split('::')[1]
      dedupByProduct.set(productId, (dedupByProduct.get(productId) ?? 0) + (group.length - 1))
    }
  }

  // Raw post total per product, summed across every run aggregate of that
  // product (normally one — a product spans multiple variant-keyed
  // aggregates only in the rare case of drawn variants of the same product).
  const rawPostCountByProduct = new Map<string, number>()
  for (const [, aggregate] of runAggregates) {
    rawPostCountByProduct.set(aggregate.productId, (rawPostCountByProduct.get(aggregate.productId) ?? 0) + aggregate.rawPostCount)
  }
  const postCountByProduct = new Map<string, number>()
  for (const [productId, rawCount] of rawPostCountByProduct) {
    const dedup = dedupByProduct.get(productId) ?? 0
    postCountByProduct.set(productId, Math.max(0, rawCount - dedup))
  }
  for (const [, entry] of pointCounts) {
    const geometry = requireProductGeometry(entry.productId, productGeometryByProductId)
    const posts = entry.quantity * geometry.postsPerRunExtra
    postCountByProduct.set(entry.productId, (postCountByProduct.get(entry.productId) ?? 0) + posts)
  }

  const drawnLines: AnterDrawnBomLineDraft[] = []
  for (const [, aggregate] of runAggregates) {
    // A deduped vertex post is shared across every run aggregate of this
    // product, so it is only attributed to the first line emitted for it —
    // otherwise a product drawn as two variant-keyed aggregates would double
    // count the shared post's derived anchors.
    const totalForProduct = postCountByProduct.get(aggregate.productId) ?? aggregate.rawPostCount
    const rawForProduct = rawPostCountByProduct.get(aggregate.productId) ?? aggregate.rawPostCount
    const share = rawForProduct > 0 ? aggregate.rawPostCount / rawForProduct : 0
    const postCount = Math.round(totalForProduct * share)
    const geometry = requireProductGeometry(aggregate.productId, productGeometryByProductId)
    drawnLines.push({
      origin: 'drawn',
      productId: aggregate.productId,
      productVariantId: aggregate.productVariantId,
      sourceElementIds: [...aggregate.sourceElementIds],
      quantity: aggregate.moduleCount,
      unitCode: 'pcs',
      realisedLengthM: aggregate.realisedLengthM,
      residualLengthM: aggregate.residualLengthM,
      moduleCount: aggregate.moduleCount,
      postCount,
      anchorCount: deriveAnchorCount(postCount, geometry.anchorsPerPost),
    })
  }
  for (const [, entry] of pointCounts) {
    const geometry = requireProductGeometry(entry.productId, productGeometryByProductId)
    const postCount = entry.quantity * geometry.postsPerRunExtra
    drawnLines.push({
      origin: 'drawn',
      productId: entry.productId,
      productVariantId: entry.productVariantId,
      sourceElementIds: [...entry.sourceElementIds],
      quantity: entry.quantity,
      unitCode: 'pcs',
      realisedLengthM: null,
      residualLengthM: null,
      moduleCount: null,
      postCount,
      anchorCount: deriveAnchorCount(postCount, geometry.anchorsPerPost),
    })
  }

  // Derived lines (posts, anchors) aggregate by catalogue SKU — several
  // drawn products can consume the same physical post or anchor SKU.
  const postSkuTotals = new Map<string, { quantity: number; sourceElementIds: Set<string> }>()
  const anchorSkuTotals = new Map<string, { quantity: number; sourceElementIds: Set<string> }>()
  for (const line of drawnLines) {
    const geometry = requireProductGeometry(line.productId, productGeometryByProductId)
    if (geometry.postSku && line.postCount) {
      const entry = postSkuTotals.get(geometry.postSku) ?? { quantity: 0, sourceElementIds: new Set<string>() }
      entry.quantity += line.postCount
      line.sourceElementIds.forEach((id) => entry.sourceElementIds.add(id))
      postSkuTotals.set(geometry.postSku, entry)
    }
    if (geometry.anchorSku && line.anchorCount) {
      const entry = anchorSkuTotals.get(geometry.anchorSku) ?? { quantity: 0, sourceElementIds: new Set<string>() }
      entry.quantity += line.anchorCount
      line.sourceElementIds.forEach((id) => entry.sourceElementIds.add(id))
      anchorSkuTotals.set(geometry.anchorSku, entry)
    }
  }

  const derivedLines: AnterDerivedBomLineDraft[] = [
    ...[...postSkuTotals.entries()].map(([sku, entry]) => ({
      origin: 'derived' as const,
      sku,
      sourceElementIds: [...entry.sourceElementIds],
      quantity: entry.quantity,
      unitCode: 'pcs' as const,
    })),
    ...[...anchorSkuTotals.entries()].map(([sku, entry]) => ({
      origin: 'derived' as const,
      sku,
      sourceElementIds: [...entry.sourceElementIds],
      quantity: entry.quantity,
      unitCode: 'pcs' as const,
    })),
  ]

  return { drawnLines, derivedLines }
}
