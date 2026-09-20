import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterProjectRevision } from '../data/entities'
import type { AnterRevisionCalibrationInput } from '../data/validators'
import { AnterGeometryError, metresPerUnitFromCalibration } from '../services/anterGeometryService'

export type CalibrationResult = { revisionId: string; metresPerUnit: number }

/**
 * Applies two-point calibration to a `draft` revision (spec §3.4, C5).
 * Shared by the staff (internal-mode) and portal calibration routes.
 * Callers MUST check the optimistic lock before calling this.
 */
export async function applyCalibration(
  em: EntityManager,
  revision: AnterProjectRevision,
  input: AnterRevisionCalibrationInput,
): Promise<CalibrationResult> {
  if (revision.state !== 'draft') {
    throw new CrudHttpError(409, { error: 'revision_locked', reason: 'calibrated_after_submission' })
  }

  const { pointA, pointB, realDistanceM } = input.calibrationPoints
  let metresPerUnit: number
  try {
    metresPerUnit = metresPerUnitFromCalibration(pointA, pointB, realDistanceM)
  } catch (error) {
    if (error instanceof AnterGeometryError) {
      throw new CrudHttpError(422, { error: error.code, message: error.message })
    }
    throw error
  }

  revision.metresPerUnit = String(metresPerUnit)
  revision.calibrationPoints = { pointA, pointB, realDistanceM }
  if (input.underlayWidthUnits != null) revision.underlayWidthUnits = String(input.underlayWidthUnits)
  if (input.underlayHeightUnits != null) revision.underlayHeightUnits = String(input.underlayHeightUnits)
  await em.flush()

  return { revisionId: revision.id, metresPerUnit }
}
