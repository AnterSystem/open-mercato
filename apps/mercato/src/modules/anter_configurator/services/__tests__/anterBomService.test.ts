import { AnterGeometryError, type Vertex } from '../anterGeometryService'
import { computeAnterBom, type AnterBomElement, type AnterProductGeometry } from '../anterBomService'

const BARRIER_A: AnterProductGeometry = {
  productId: 'product-barrier-a',
  productVariantId: null,
  drawingKind: 'line',
  moduleLengthM: 1.8,
  moduleFitPolicy: 'round_down',
  postSku: 'POST-STD',
  postsPerRunExtra: 1,
  anchorSku: 'ANCHOR-STD',
  anchorsPerPost: 4,
  insertClearWidthM: null,
}

const BARRIER_B: AnterProductGeometry = {
  ...BARRIER_A,
  productId: 'product-barrier-b',
  postSku: 'POST-B',
  anchorSku: 'ANCHOR-B',
}

const GATE: AnterProductGeometry = {
  productId: 'product-gate',
  productVariantId: null,
  drawingKind: 'insert',
  moduleLengthM: null,
  moduleFitPolicy: 'round_down',
  postSku: 'POST-GATE',
  postsPerRunExtra: 2,
  anchorSku: 'ANCHOR-GATE',
  anchorsPerPost: 2,
  insertClearWidthM: 3.0,
}

const COLUMN_GUARD: AnterProductGeometry = {
  productId: 'product-column-guard',
  productVariantId: null,
  drawingKind: 'point',
  moduleLengthM: null,
  moduleFitPolicy: 'round_down',
  postSku: 'POST-GUARD',
  postsPerRunExtra: 1,
  anchorSku: 'ANCHOR-GUARD',
  anchorsPerPost: 4,
  insertClearWidthM: null,
}

function run(id: string, productId: string, vertices: Vertex[]): AnterBomElement {
  return { id, elementKind: 'run', productId, productVariantId: null, vertices }
}

describe('computeAnterBom', () => {
  // 42.0 m straight run at metresPerUnit = 1 (plan units == metres for
  // readability); 1.8 m module, round_down -> 23 modules, 41.4 m realised,
  // 0.6 m residual, 24 posts, 96 anchors (spec §Test coverage fixture 1).
  it('derives modules, posts and anchors for a straight run', () => {
    const result = computeAnterBom({
      elements: [run('run-1', BARRIER_A.productId, [[0, 0], [42, 0]])],
      metresPerUnit: 1,
      productGeometryByProductId: { [BARRIER_A.productId]: BARRIER_A },
    })

    expect(result.drawnLines).toHaveLength(1)
    const line = result.drawnLines[0]
    expect(line.moduleCount).toBe(23)
    expect(line.realisedLengthM).toBe(41.4)
    expect(line.residualLengthM).toBe(0.6)
    expect(line.postCount).toBe(24)
    expect(line.anchorCount).toBe(96)

    const postLine = result.derivedLines.find((l) => l.sku === 'POST-STD')
    const anchorLine = result.derivedLines.find((l) => l.sku === 'ANCHOR-STD')
    expect(postLine?.quantity).toBe(24)
    expect(anchorLine?.quantity).toBe(96)
  })

  // Fixture 3: run with one gate insert -> two segments, gate's clear width
  // removed, gate's own posts added.
  it('splits a run at a gate insert and adds the gate own posts/anchors', () => {
    const result = computeAnterBom({
      elements: [
        run('run-1', BARRIER_A.productId, [[0, 0], [42, 0]]),
        {
          id: 'gate-1',
          elementKind: 'insert',
          productId: GATE.productId,
          productVariantId: null,
          position: [21, 0],
          hostElementId: 'run-1',
          hostOffsetRatio: 0.5,
        },
      ],
      metresPerUnit: 1,
      productGeometryByProductId: { [BARRIER_A.productId]: BARRIER_A, [GATE.productId]: GATE },
    })

    const barrierLine = result.drawnLines.find((l) => l.productId === BARRIER_A.productId)!
    // Two 19.5 m segments -> floor(19.5/1.8) = 10 modules each = 20 total.
    expect(barrierLine.moduleCount).toBe(20)
    // Each open segment gets its own +1 -> 11 + 11 = 22 posts on the barrier.
    expect(barrierLine.postCount).toBe(22)

    const gateLine = result.drawnLines.find((l) => l.productId === GATE.productId)!
    expect(gateLine.quantity).toBe(1)
    expect(gateLine.postCount).toBe(2)
    expect(gateLine.anchorCount).toBe(4)
  })

  // Fixture 4: two runs of the same product sharing a vertex -> the shared
  // post is counted once.
  it('dedups a post at a vertex shared by two runs of the same product', () => {
    const result = computeAnterBom({
      elements: [
        run('run-1', BARRIER_A.productId, [[0, 0], [10, 0]]),
        run('run-2', BARRIER_A.productId, [[10, 0], [10, 10]]),
      ],
      metresPerUnit: 1,
      productGeometryByProductId: { [BARRIER_A.productId]: BARRIER_A },
    })

    // Each run: 10 / 1.8 -> 5 modules, raw postCount 6 each -> 12 raw.
    // Shared vertex at (10,0) dedups by 1 -> 11 total posts for the product.
    const totalPosts = result.drawnLines
      .filter((l) => l.productId === BARRIER_A.productId)
      .reduce((sum, l) => sum + (l.postCount ?? 0), 0)
    expect(totalPosts).toBe(11)
  })

  // Fixture 5: two runs of different products sharing a vertex -> posts
  // counted per product, no cross-product dedup.
  it('does not dedup a shared vertex across different products', () => {
    const result = computeAnterBom({
      elements: [
        run('run-1', BARRIER_A.productId, [[0, 0], [10, 0]]),
        run('run-2', BARRIER_B.productId, [[10, 0], [10, 10]]),
      ],
      metresPerUnit: 1,
      productGeometryByProductId: { [BARRIER_A.productId]: BARRIER_A, [BARRIER_B.productId]: BARRIER_B },
    })

    const lineA = result.drawnLines.find((l) => l.productId === BARRIER_A.productId)!
    const lineB = result.drawnLines.find((l) => l.productId === BARRIER_B.productId)!
    expect(lineA.postCount).toBe(6)
    expect(lineB.postCount).toBe(6)
  })

  // Fixture 6: closed loop -> postCount == moduleCount, no +1.
  it('uses moduleCount with no +1 for a closed loop', () => {
    const result = computeAnterBom({
      elements: [run('run-1', BARRIER_A.productId, [[0, 0], [18, 0], [18, 18], [0, 18], [0, 0]])],
      metresPerUnit: 1,
      productGeometryByProductId: { [BARRIER_A.productId]: BARRIER_A },
    })
    const line = result.drawnLines[0]
    // Perimeter = 72m / 1.8 = 40 modules exactly.
    expect(line.moduleCount).toBe(40)
    expect(line.postCount).toBe(40)
  })

  // Fixture 7: run shorter than one module -> validation error, not a
  // zero-module line.
  it('throws rather than emitting a zero-module line for a too-short run', () => {
    expect(() =>
      computeAnterBom({
        elements: [run('run-1', BARRIER_A.productId, [[0, 0], [1, 0]])],
        metresPerUnit: 1,
        productGeometryByProductId: { [BARRIER_A.productId]: BARRIER_A },
      }),
    ).toThrow(AnterGeometryError)
  })

  // Fixture 8: point products -> quantity equals placed count; posts and
  // anchors derived from the same fields.
  it('derives point-product quantity, posts and anchors from placement count', () => {
    const result = computeAnterBom({
      elements: [
        { id: 'p1', elementKind: 'point', productId: COLUMN_GUARD.productId, productVariantId: null, position: [1, 1] },
        { id: 'p2', elementKind: 'point', productId: COLUMN_GUARD.productId, productVariantId: null, position: [5, 5] },
        { id: 'p3', elementKind: 'point', productId: COLUMN_GUARD.productId, productVariantId: null, position: [9, 9] },
      ],
      metresPerUnit: 1,
      productGeometryByProductId: { [COLUMN_GUARD.productId]: COLUMN_GUARD },
    })

    const line = result.drawnLines.find((l) => l.productId === COLUMN_GUARD.productId)!
    expect(line.quantity).toBe(3)
    expect(line.postCount).toBe(3)
    expect(line.anchorCount).toBe(12)
  })
})
