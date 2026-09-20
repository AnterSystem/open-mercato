import {
  AnterGeometryError,
  deriveAnchorCount,
  derivePostCount,
  findNearestCoverageDistanceM,
  fitModules,
  isClosedLoop,
  metresPerUnitFromCalibration,
  polylineLengthUnits,
  splitRunAtInserts,
} from '../anterGeometryService'

describe('anterGeometryService', () => {
  describe('fitModules', () => {
    // Spec §Test coverage fixture: "Straight 42.0 m run, 1.8 m module,
    // round_down → 23 modules, 41.4 m realised, 0.6 m residual".
    it('rounds down by default, showing the residual rather than hiding it', () => {
      const result = fitModules(42.0, 1.8, 'round_down')
      expect(result.moduleCount).toBe(23)
      expect(result.realisedLengthM).toBe(41.4)
      expect(result.residualLengthM).toBe(0.6)
    })

    it('rounds up, producing a negative residual', () => {
      const result = fitModules(42.0, 1.8, 'round_up')
      expect(result.moduleCount).toBe(24)
      expect(result.realisedLengthM).toBe(43.2)
      expect(result.residualLengthM).toBe(-1.2)
    })

    it('rounds to nearest', () => {
      const result = fitModules(42.0, 1.8, 'nearest')
      // 42.0 / 1.8 = 23.33.. -> nearest is 23
      expect(result.moduleCount).toBe(23)
      expect(result.realisedLengthM).toBe(41.4)
      expect(result.residualLengthM).toBe(0.6)
    })

    it('rejects a segment shorter than one module as a validation error, not a zero-module line', () => {
      expect(() => fitModules(1.0, 1.8, 'round_down')).toThrow(AnterGeometryError)
      try {
        fitModules(1.0, 1.8, 'round_down')
      } catch (error) {
        expect((error as AnterGeometryError).code).toBe('segment_too_short')
      }
    })
  })

  describe('derivePostCount', () => {
    it('adds the configured extra for an open run (the familiar n+1)', () => {
      expect(derivePostCount(23, 1, false)).toBe(24)
    })

    it('uses moduleCount with no +1 for a closed loop', () => {
      expect(derivePostCount(23, 1, true)).toBe(23)
    })
  })

  describe('deriveAnchorCount', () => {
    it('multiplies post count by anchors per post', () => {
      expect(deriveAnchorCount(24, 4)).toBe(96)
    })
  })

  describe('splitRunAtInserts', () => {
    it('splits a run into two segments around one gate, removing its clear width', () => {
      const segments = splitRunAtInserts(42.0, [{ id: 'gate-1', hostOffsetRatio: 0.5, clearWidthM: 3.0 }])
      expect(segments).toHaveLength(2)
      // Gate centred at 21m, 1.5m either side removed.
      expect(segments[0].lengthM).toBe(19.5)
      expect(segments[1].lengthM).toBe(19.5)
      expect(segments[0].followingInsertId).toBe('gate-1')
      expect(segments[1].precedingInsertId).toBe('gate-1')
    })

    it('throws when two inserts overlap', () => {
      expect(() =>
        splitRunAtInserts(10, [
          { id: 'a', hostOffsetRatio: 0.5, clearWidthM: 6 },
          { id: 'b', hostOffsetRatio: 0.55, clearWidthM: 6 },
        ]),
      ).toThrow(AnterGeometryError)
    })
  })

  describe('isClosedLoop', () => {
    it('detects a closed polyline', () => {
      expect(isClosedLoop([[0, 0], [10, 0], [10, 10], [0, 0]])).toBe(true)
    })

    it('detects an open polyline', () => {
      expect(isClosedLoop([[0, 0], [10, 0], [10, 10]])).toBe(false)
    })
  })

  describe('polylineLengthUnits', () => {
    it('sums consecutive vertex distances', () => {
      expect(polylineLengthUnits([[0, 0], [3, 4]])).toBe(5)
    })

    it('rejects a run with fewer than two vertices', () => {
      expect(() => polylineLengthUnits([[0, 0]])).toThrow(AnterGeometryError)
    })
  })

  describe('metresPerUnitFromCalibration', () => {
    it('derives metres per plan unit from two calibration points', () => {
      // 100 plan units apart, typed as 5 real metres -> 0.05 m/unit.
      expect(metresPerUnitFromCalibration([0, 0], [100, 0], 5)).toBe(0.05)
    })

    // Spec §Test coverage fixture: "Recalibration on a draft — every length
    // scales; element geometry byte-identical." Geometry (plan-unit vertices)
    // never changes on recalibration — only `metresPerUnit` does, and every
    // derived metric length scales linearly with it.
    it('scales every derived length linearly when the same points are recalibrated to a new distance', () => {
      const before = metresPerUnitFromCalibration([0, 0], [100, 0], 5)
      const after = metresPerUnitFromCalibration([0, 0], [100, 0], 10)
      const lengthUnits = polylineLengthUnits([[0, 0], [200, 0]])
      expect(lengthUnits * after).toBe((lengthUnits * before) * 2)
    })

    it('rejects coincident calibration points', () => {
      expect(() => metresPerUnitFromCalibration([0, 0], [0, 0], 5)).toThrow(AnterGeometryError)
    })
  })

  describe('findNearestCoverageDistanceM', () => {
    it('returns the nearest candidate distance converted to metres', () => {
      // Nearest candidate is 3 plan units away; metresPerUnit 0.5 -> 1.5 m.
      const distance = findNearestCoverageDistanceM([0, 0], [[3, 0], [10, 0]], 0.5)
      expect(distance).toBe(1.5)
    })

    it('returns null when there are no candidates', () => {
      expect(findNearestCoverageDistanceM([0, 0], [], 1)).toBeNull()
    })
  })
})
