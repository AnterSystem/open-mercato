import { z } from 'zod'

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
})

export const anterProjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customerEntityId: z.string().uuid().nullable().optional(),
  customerUserId: z.string().uuid().nullable().optional(),
  customerDealId: z.string().uuid().nullable().optional(),
  origin: z.enum(['portal', 'internal']).default('internal'),
  siteAddressSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type AnterProjectCreateInput = z.infer<typeof anterProjectCreateSchema>

export const anterProjectListSchema = paginationSchema.extend({
  id: z.string().uuid().optional(),
  customerEntityId: z.string().uuid().optional(),
  status: z.enum(['active', 'abandoned', 'closed']).optional(),
})
export type AnterProjectListQuery = z.infer<typeof anterProjectListSchema>

// One plan-unit vertex, `[x, y]`, origin top-left, y downward (spec §3.4).
const geometryVertexSchema = z.tuple([z.number().finite(), z.number().finite()])

const runGeometrySchema = z.object({ vertices: z.array(geometryVertexSchema).min(2) })
const pointGeometrySchema = z.object({ position: geometryVertexSchema, rotation: z.number().finite().optional() })
const elementGeometrySchema = z.union([runGeometrySchema, pointGeometrySchema])

export const anterProjectElementInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    elementKind: z.enum(['run', 'point', 'insert', 'annotation']),
    productId: z.string().uuid().nullable().optional(),
    productVariantId: z.string().uuid().nullable().optional(),
    geometry: elementGeometrySchema,
    hostElementId: z.string().uuid().nullable().optional(),
    hostOffsetRatio: z.number().min(0).max(1).nullable().optional(),
    label: z.string().trim().max(200).nullable().optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.elementKind === 'run' && !('vertices' in value.geometry)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '[internal] run elements require vertices geometry' })
    }
    if ((value.elementKind === 'point' || value.elementKind === 'insert') && !('position' in value.geometry)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '[internal] point/insert elements require position geometry' })
    }
    if (value.elementKind === 'insert' && !value.hostElementId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '[internal] insert elements require hostElementId' })
    }
  })
export type AnterProjectElementInput = z.infer<typeof anterProjectElementInputSchema>

export const anterRevisionElementsReplaceSchema = z.object({
  elements: z.array(anterProjectElementInputSchema),
})
export type AnterRevisionElementsReplaceInput = z.infer<typeof anterRevisionElementsReplaceSchema>

export const anterRevisionCalibrationSchema = z.object({
  calibrationPoints: z.object({
    pointA: geometryVertexSchema,
    pointB: geometryVertexSchema,
    realDistanceM: z.number().positive(),
  }),
  underlayWidthUnits: z.number().positive().optional(),
  underlayHeightUnits: z.number().positive().optional(),
})
export type AnterRevisionCalibrationInput = z.infer<typeof anterRevisionCalibrationSchema>

export const anterPlanPointKindSchema = z.enum(['rack_corner', 'column', 'crossing', 'dock', 'technical_entrance', 'charging_station'])

export const anterPlanPointInputSchema = z.object({
  id: z.string().uuid().optional(),
  pointKind: anterPlanPointKindSchema,
  position: geometryVertexSchema,
  coverageRadiusM: z.number().positive().default(1.5),
  skipReason: z.string().trim().max(500).nullable().optional(),
})
export type AnterPlanPointInput = z.infer<typeof anterPlanPointInputSchema>

export const anterRevisionPointsReplaceSchema = z.object({
  points: z.array(anterPlanPointInputSchema),
})
export type AnterRevisionPointsReplaceInput = z.infer<typeof anterRevisionPointsReplaceSchema>

export const anterCustomItemCreateSchema = z.object({
  revisionId: z.string().uuid(),
  description: z.string().trim().min(1).max(2000),
  quantity: z.coerce.number().positive(),
  unitCode: z.string().trim().min(1).max(20),
  assignedConstructorUserId: z.string().uuid().nullable().optional(),
})
export type AnterCustomItemCreateInput = z.infer<typeof anterCustomItemCreateSchema>

export const anterCustomItemUpdateSchema = anterCustomItemCreateSchema.partial().extend({
  id: z.string().uuid(),
})
export type AnterCustomItemUpdateInput = z.infer<typeof anterCustomItemUpdateSchema>

export const anterCustomItemListSchema = paginationSchema.extend({
  id: z.string().uuid().optional(),
  revisionId: z.string().uuid().optional(),
  valuationState: z.enum(['awaiting', 'priced', 'declined']).optional(),
})
export type AnterCustomItemListQuery = z.infer<typeof anterCustomItemListSchema>

// `anter_configurator.revision.compute_bom` command input (spec §API Contracts).
export const anterRevisionComputeBomSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  revisionId: z.string().uuid(),
  // Whose partner pricing to resolve BOM lines against. Omitted resolves list
  // price only (internal mode without a bound partner, §3.7).
  customerEntityId: z.string().uuid().nullable().optional(),
  currencyCode: z.string().trim().length(3).default('PLN'),
})
export type AnterRevisionComputeBomInput = z.infer<typeof anterRevisionComputeBomSchema>
