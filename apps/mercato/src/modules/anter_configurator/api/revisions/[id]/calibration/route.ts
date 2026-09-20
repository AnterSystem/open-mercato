import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { AnterProjectRevision } from '../../../../data/entities'
import { anterRevisionCalibrationSchema } from '../../../../data/validators'
import { applyCalibration } from '../../../../lib/calibrationService'
import { resolveAnterConfiguratorCommandContext } from '../../../../lib/staffCommandContext'
import { anterConfiguratorTag } from '../../../openapi'

export const metadata = { PUT: { requireAuth: true, requireFeatures: ['anter_configurator.internal'] } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

/**
 * Two-point calibration (spec §3.4, decision C5). Recalibrating a revision
 * that has been submitted is forbidden — it forces a new revision instead,
 * because the same property that makes recalibration cheap (plan-unit
 * storage) makes it able to change every quantity under an accepted document
 * without touching a single element.
 */
export async function PUT(req: Request, routeCtx: RouteContext) {
  const { translate } = await resolveTranslations()
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) {
    return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input') }, { status: 400 })
  }

  let body: unknown = {}
  const rawText = await req.text()
  if (rawText.trim().length) {
    try {
      body = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
  }
  const parsed = anterRevisionCalibrationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: translate('anter_configurator.errors.invalidInput', 'Invalid input'), issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const { ctx, container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)

    const guardResult = await runRouteMutationGuards({
      container,
      req,
      auth: { userId: ctx.auth!.sub, tenantId, organizationId },
      input: { resourceKind: 'anter_configurator.revision', resourceId: revisionId, operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    const em = (container.resolve('em') as EntityManager).fork()
    const revision = await em.findOne(AnterProjectRevision, { id: revisionId, organizationId, tenantId, deletedAt: null })
    if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })

    enforceCommandOptimisticLock({ resourceKind: 'anter_configurator.revision', resourceId: revision.id, current: revision.updatedAt, request: req })

    const result = await applyCalibration(em, revision, parsed.data)

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
  summary: 'Calibrate a revision',
  methods: {
    PUT: {
      summary: 'Two-point calibration: sets metresPerUnit from two clicked points and a typed real distance',
      requestBody: { contentType: 'application/json', schema: anterRevisionCalibrationSchema },
      responses: [{ status: 200, description: 'Calibrated', schema: z.object({ item: z.object({ revisionId: z.string().uuid(), metresPerUnit: z.number() }) }) }],
      errors: [
        { status: 404, description: 'Revision not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Revision locked (submitted) or optimistic-lock conflict', schema: z.object({ error: z.string() }) },
        { status: 422, description: 'Invalid calibration points', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
