/**
 * Pure geometry arithmetic (spec §3.4–§3.5, Implementation Plan step 4). No DB
 * access — this is the half of the "must be identical in two implementations"
 * contract (C4) that ships first; the browser reimplements these exact
 * formulas against the same fixtures (§Test coverage).
 *
 * Rounding: every metric output is rounded to 4 decimal places, matching the
 * fixture suite's "identical to four decimal places" assertion and the
 * `numeric(16,4)` column scale everything lands in.
 */

export type Vertex = [number, number]

export class AnterGeometryError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'AnterGeometryError'
  }
}

export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000
}

function vertexDistance(a: Vertex, b: Vertex): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return Math.sqrt(dx * dx + dy * dy)
}

/** Sum of consecutive vertex distances, in plan units. */
export function polylineLengthUnits(vertices: Vertex[]): number {
  if (vertices.length < 2) {
    throw new AnterGeometryError('run_too_few_vertices', '[internal] a run needs at least two distinct vertices')
  }
  let total = 0
  for (let i = 1; i < vertices.length; i++) total += vertexDistance(vertices[i - 1], vertices[i])
  return total
}

export function isClosedLoop(vertices: Vertex[]): boolean {
  const [first] = vertices
  const last = vertices[vertices.length - 1]
  return vertexDistance(first, last) < 1e-9
}

/**
 * Two-point calibration (C5): the user clicks two points on the underlay and
 * types the real distance between them. `lengthM = lengthInUnits × metresPerUnit`.
 */
export function metresPerUnitFromCalibration(pointA: Vertex, pointB: Vertex, realDistanceM: number): number {
  const distanceUnits = vertexDistance(pointA, pointB)
  if (distanceUnits <= 1e-9) {
    throw new AnterGeometryError('calibration_points_coincide', '[internal] calibration points must be distinct')
  }
  if (realDistanceM <= 0) {
    throw new AnterGeometryError('calibration_distance_invalid', '[internal] real distance must be positive')
  }
  return realDistanceM / distanceUnits
}

export type RunInsert = {
  /** The insert element's id, for `source_element_ids` traceability. */
  id: string
  /** Parametric offset along the host run, 0…1, centred on the insert. */
  hostOffsetRatio: number
  clearWidthM: number
}

export type RunSegment = {
  lengthM: number
  /** Elements bounding this segment on the left/right, for traceability. */
  precedingInsertId: string | null
  followingInsertId: string | null
}

/**
 * Step 1 (§3.5): splits a run of `runLengthM` at each insert placed on it,
 * removing `clearWidthM` centred on the insert's offset. Inserts are applied
 * in offset order so overlapping inserts fail loudly rather than silently
 * producing a negative-length segment.
 */
export function splitRunAtInserts(runLengthM: number, inserts: RunInsert[]): RunSegment[] {
  const sorted = [...inserts].sort((a, b) => a.hostOffsetRatio - b.hostOffsetRatio)
  const segments: RunSegment[] = []
  let cursorM = 0
  let precedingInsertId: string | null = null

  for (const insert of sorted) {
    const centerM = insert.hostOffsetRatio * runLengthM
    const halfWidth = insert.clearWidthM / 2
    const segmentEndM = centerM - halfWidth
    if (segmentEndM < cursorM - 1e-9) {
      throw new AnterGeometryError('insert_overlap', `[internal] insert ${insert.id} overlaps the preceding segment`)
    }
    segments.push({
      lengthM: round4(Math.max(0, segmentEndM - cursorM)),
      precedingInsertId,
      followingInsertId: insert.id,
    })
    cursorM = centerM + halfWidth
    precedingInsertId = insert.id
  }

  if (cursorM > runLengthM + 1e-9) {
    throw new AnterGeometryError('insert_overlap', '[internal] the last insert overruns the run')
  }
  segments.push({
    lengthM: round4(Math.max(0, runLengthM - cursorM)),
    precedingInsertId,
    followingInsertId: null,
  })
  return segments
}

export type ModuleFitPolicy = 'round_down' | 'round_up' | 'nearest'

export type ModuleFitResult = {
  moduleCount: number
  realisedLengthM: number
  /** Signed; negative under `round_up`. */
  residualLengthM: number
}

/**
 * Step 2 (§3.5). `round_down` is the default: over-delivering length is a
 * fabrication problem, under-delivering is a visible, discussable gap.
 */
export function fitModules(segmentLengthM: number, moduleLengthM: number, policy: ModuleFitPolicy): ModuleFitResult {
  if (moduleLengthM <= 0) {
    throw new AnterGeometryError('module_length_invalid', '[internal] module length must be positive')
  }
  const rawCount = segmentLengthM / moduleLengthM
  const moduleCount = policy === 'round_down' ? Math.floor(rawCount + 1e-9)
    : policy === 'round_up' ? Math.ceil(rawCount - 1e-9)
    : Math.round(rawCount)

  if (moduleCount <= 0) {
    throw new AnterGeometryError('segment_too_short', '[internal] segment is shorter than one module of its product')
  }

  const realisedLengthM = round4(moduleCount * moduleLengthM)
  const residualLengthM = round4(segmentLengthM - realisedLengthM)
  return { moduleCount, realisedLengthM, residualLengthM }
}

/**
 * Step 3 (§3.5). A closed loop (first vertex equal to last) uses
 * `moduleCount` with no `+1` — there is no open end needing an extra post.
 */
export function derivePostCount(moduleCount: number, postsPerRunExtra: number, closedLoop: boolean): number {
  return closedLoop ? moduleCount : moduleCount + postsPerRunExtra
}

/** Step 4 (§3.5). */
export function deriveAnchorCount(postCount: number, anchorsPerPost: number): number {
  return postCount * anchorsPerPost
}

/**
 * §3.15: a plan point is `covered` when a drawn element lies within
 * `coverageRadiusM` of it. `candidateVertices` are every vertex/position of
 * every drawn (non-annotation) element, already in the same plan-unit space
 * as `pointPosition`.
 */
export function findNearestCoverageDistanceM(
  pointPosition: Vertex,
  candidateVertices: Vertex[],
  metresPerUnit: number,
): number | null {
  if (!candidateVertices.length) return null
  let nearestUnits = Infinity
  for (const candidate of candidateVertices) {
    const distance = vertexDistance(pointPosition, candidate)
    if (distance < nearestUnits) nearestUnits = distance
  }
  return Number.isFinite(nearestUnits) ? round4(nearestUnits * metresPerUnit) : null
}
