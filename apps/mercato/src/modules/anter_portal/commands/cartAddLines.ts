import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { AnterCart, AnterCartLine } from '../data/entities'
import { anterCartAddLinesSchema, type AnterCartAddLinesInput } from '../data/validators'
import type { AnterCartService } from '../services/anterCartService'

const CART_RESOURCE_KIND = 'anter_portal.cart'

type ExistingLineSnapshot = {
  productId: string
  productVariantId: string | null
  existingLineId: string | null
  previousQuantity: string | null
}

type BeforeSnapshot = {
  cartId: string | null
  cartUpdatedAt: string | null
  lines: ExistingLineSnapshot[]
}

type AddLinesResult = {
  cartId: string
  addedLineIds: Array<{ productId: string; productVariantId: string | null; lineId: string; wasCreated: boolean }>
}

registerCommand({
  id: 'anter_portal.cart.add_lines',
  isUndoable: true,
  async prepare(rawInput, ctx) {
    const parsed = parseInputStrict(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const cart = await em.findOne(AnterCart, {
      customerUserId: parsed.customerUserId,
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      status: 'active',
      deletedAt: null,
    })

    const lines: ExistingLineSnapshot[] = []
    for (const line of parsed.lines) {
      const productVariantId = line.productVariantId ?? null
      const existing = cart
        ? await em.findOne(AnterCartLine, {
            cartId: cart.id,
            productId: line.productId,
            productVariantId,
            organizationId: parsed.organizationId,
            tenantId: parsed.tenantId,
          })
        : null
      lines.push({
        productId: line.productId,
        productVariantId,
        existingLineId: existing?.id ?? null,
        previousQuantity: existing?.quantity ?? null,
      })
    }

    const before: BeforeSnapshot = {
      cartId: cart?.id ?? null,
      cartUpdatedAt: cart?.updatedAt ? cart.updatedAt.toISOString() : null,
      lines,
    }
    return { before }
  },
  async execute(rawInput, ctx): Promise<AddLinesResult> {
    const parsed = parseInputStrict(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const cartService = ctx.container.resolve<AnterCartService>('anterCartService')
    const scope = { organizationId: parsed.organizationId, tenantId: parsed.tenantId }
    const principal = { customerEntityId: parsed.customerEntityId, customerUserId: parsed.customerUserId }

    const lines = parsed.lines.map((line) => ({
      productId: line.productId,
      productVariantId: line.productVariantId ?? null,
      quantity: line.quantity,
    }))
    const result = await cartService.addLines(scope, principal, lines, ctx.request as Request, { sourceRevisionId: parsed.sourceRevisionId ?? null })

    return {
      cartId: result.cartId,
      addedLineIds: result.lines.map((line) => ({
        productId: line.productId,
        productVariantId: line.productVariantId,
        lineId: line.lineId,
        wasCreated: line.wasCreated,
      })),
    }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Add configurator BOM lines to cart',
    resourceKind: CART_RESOURCE_KIND,
    resourceId: result.cartId,
    payload: { undo: { before: snapshots.before, after: result } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: BeforeSnapshot; after: AddLinesResult }>(logEntry)
    if (!payload?.before || !payload.after) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const cart = await em.findOne(AnterCart, { id: payload.after.cartId })
    if (!cart) return

    const byKey = new Map(payload.before.lines.map((snapshot) => [`${snapshot.productId}:${snapshot.productVariantId ?? ''}`, snapshot]))

    await withAtomicFlush(em, [
      async () => {
        for (const added of payload.after.addedLineIds) {
          const key = `${added.productId}:${added.productVariantId ?? ''}`
          const snapshot = byKey.get(key)
          const line = await em.findOne(AnterCartLine, { id: added.lineId })
          if (!line) continue
          if (!snapshot || snapshot.existingLineId == null) {
            em.remove(line)
          } else if (snapshot.previousQuantity != null) {
            line.quantity = snapshot.previousQuantity
          }
        }
      },
      () => {
        if (payload.before.cartUpdatedAt) {
          cart.updatedAt = new Date(payload.before.cartUpdatedAt)
        }
      },
    ], { transaction: true, label: 'anter_portal.cart.add_lines.undo' })
  },
} satisfies CommandHandler<unknown, AddLinesResult>)

function parseInputStrict(rawInput: unknown): AnterCartAddLinesInput & { organizationId: string; tenantId: string; customerEntityId: string; customerUserId: string } {
  const raw = rawInput as Record<string, unknown>
  const result = anterCartAddLinesSchema.safeParse({ lines: raw?.lines, sourceRevisionId: raw?.sourceRevisionId })
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_portal.cart.add_lines input', issues: result.error.issues })
  }
  const organizationId = raw?.organizationId
  const tenantId = raw?.tenantId
  const customerEntityId = raw?.customerEntityId
  const customerUserId = raw?.customerUserId
  if (
    typeof organizationId !== 'string' || typeof tenantId !== 'string'
    || typeof customerEntityId !== 'string' || typeof customerUserId !== 'string'
  ) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_portal.cart.add_lines input' })
  }
  return { ...result.data, organizationId, tenantId, customerEntityId, customerUserId }
}
