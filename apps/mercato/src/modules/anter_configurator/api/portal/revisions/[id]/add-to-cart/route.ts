import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { AnterBomLine, AnterCustomItem } from '../../../../../data/entities'
import { computeBomIfCalibrated } from '../../../../../lib/revisionElementsService'
import { loadOwnedRevision } from '../../../../../lib/portalOwnership'
import { resolveAnterConfiguratorPortalContext } from '../../../../../lib/portalContext'
import { anterConfiguratorTag } from '../../../../openapi'

export const metadata = { POST: { requireAuth: false } }

type RouteParams = { id: string }
type RouteContext = { params: Promise<RouteParams> }

type AddToCartResult = { cartId: string; addedLineIds: unknown[] }

/**
 * Priced track: configuration → existing cart (spec §API Contracts Portal
 * table, Implementation Plan Phase G step 19). Recomputes the BOM first —
 * never trusts the caller's last-known numbers — then refuses when any line
 * is unpriced (§3.6: a partner cannot check out a configuration containing
 * an unpriced position). `revision_superseded` cannot fire yet: revision
 * branching and submissions are Phase I/J scope, so no other revision can
 * supersede this one before then.
 */
export async function POST(req: Request, routeCtx: RouteContext) {
  const params = await routeCtx.params
  const revisionId = params.id?.trim()
  if (!revisionId) return NextResponse.json({ error: '[internal] invalid input' }, { status: 400 })

  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  try {
    const { revision } = await loadOwnedRevision(context.em, revisionId, context)

    const guardResult = await runRouteMutationGuards({
      container: context.container,
      req,
      auth: { userId: context.customerUserId, tenantId: context.tenantId, organizationId: context.organizationId, userFeatures: [] },
      input: { resourceKind: 'anter_portal.cart', operation: 'update' },
    })
    if (!guardResult.ok) return guardResult.response

    const scope = { organizationId: context.organizationId, tenantId: context.tenantId }
    const commandCtx: CommandRuntimeContext = {
      container: context.container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: context.organizationId,
      organizationIds: [context.organizationId],
      request: req,
    }
    const bom = await computeBomIfCalibrated(context.container, commandCtx, revision, scope, 'PLN', context.customerEntityId)
    if (!bom) {
      return NextResponse.json({ error: '[internal] revision has not been calibrated yet' }, { status: 422 })
    }

    const lines = await context.em.find(AnterBomLine, { revisionId: revision.id })
    const unpricedLineCount = lines.filter((line) => line.priceState !== 'priced').length
    const customItems = await context.em.find(AnterCustomItem, { revisionId: revision.id, deletedAt: null })
    const customItemCount = customItems.filter((item) => item.valuationState !== 'priced').length

    if (unpricedLineCount > 0 || customItemCount > 0) {
      return NextResponse.json({
        error: 'configuration_not_orderable',
        unpricedLineCount,
        customItemCount,
        suggestedAction: 'quote_request',
      }, { status: 409 })
    }

    const commandBus = context.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, AddToCartResult>('anter_portal.cart.add_lines', {
      input: {
        organizationId: context.organizationId,
        tenantId: context.tenantId,
        customerEntityId: context.customerEntityId,
        customerUserId: context.customerUserId,
        lines: lines.map((line) => ({
          productId: line.productId,
          productVariantId: line.productVariantId ?? null,
          quantity: Number(line.quantity),
        })),
      },
      ctx: commandCtx,
    })

    await guardResult.runAfterSuccess()

    return NextResponse.json({ item: { cartId: result.cartId, lineCount: result.addedLineIds.length } })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'Portal: add a priced revision to the cart',
  methods: {
    POST: {
      summary: 'Recomputes, then calls anter_portal.cart.add_lines',
      responses: [{ status: 200, description: 'Added', schema: z.object({ item: z.object({ cartId: z.string().uuid(), lineCount: z.number() }) }) }],
      errors: [
        { status: 404, description: 'Revision not found', schema: z.object({ error: z.string() }) },
        { status: 409, description: 'Unpriced line or custom item present', schema: z.object({ error: z.literal('configuration_not_orderable'), unpricedLineCount: z.number(), customItemCount: z.number(), suggestedAction: z.literal('quote_request') }) },
      ],
    },
  },
}
