import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { anterRevisionCalibrationSchema } from '../../../../../data/validators'
import { applyCalibration } from '../../../../../lib/calibrationService'
import { loadOwnedRevision } from '../../../../../lib/portalOwnership'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { requirePortalConfiguratorMode } from '../../../../../lib/mode'
import { anterConfiguratorTag } from '../../../../openapi'

export const metadata = { PUT: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/** Portal counterpart of the staff calibration route (spec §API Contracts Portal table). */
export async function PUT(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  let body: unknown = {}
  const rawText = await req.text()
  if (rawText.trim().length) {
    try {
      body = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })
    }
  }
  const parsed = anterRevisionCalibrationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '[internal] invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const modeOrResponse = await requirePortalConfiguratorMode(context)
  if (modeOrResponse instanceof Response) return modeOrResponse

  try {
    const { revision } = await loadOwnedRevision(context.em, revisionId, context)

    const guardResult = await runRouteMutationGuards({
      container: context.container,
      req,
      auth: { userId: context.customerUserId, tenantId: context.tenantId, organizationId: context.organizationId, userFeatures: [] },
      input: { resourceKind: 'anter_configurator.revision', resourceId: revision.id, operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    enforceCommandOptimisticLock({ resourceKind: 'anter_configurator.revision', resourceId: revision.id, current: revision.updatedAt, request: req })

    const result = await applyCalibration(context.em, revision, parsed.data)
    await guardResult.runAfterSuccess()

    return NextResponse.json({ item: result })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Portal: calibrate a revision',
  methods: {
    PUT: {
      summary: 'Two points + distance. 409 revision_locked after submission (C5)',
      requestBody: { contentType: 'application/json', schema: anterRevisionCalibrationSchema },
      responses: [{ status: 200, description: 'Calibrated', schema: z.object({ item: z.object({ revisionId: z.string().uuid(), metresPerUnit: z.number() }) }) }],
      errors: [
        { status: 404, description: 'Revision not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Revision locked or optimistic-lock conflict', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
