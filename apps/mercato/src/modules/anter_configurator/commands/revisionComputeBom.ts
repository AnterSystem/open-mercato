import { randomUUID } from 'crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { extractUndoPayload } from '@open-mercato/shared/lib/commands/undo'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { loadCustomFieldValues } from '@open-mercato/shared/lib/crud/custom-fields'
import { CatalogProduct } from '@open-mercato/core/modules/catalog/data/entities'
import { AnterProjectElement, AnterProjectRevision, AnterBomLine } from '../data/entities'
import { anterRevisionComputeBomSchema, type AnterRevisionComputeBomInput } from '../data/validators'
import { AnterGeometryError, type Vertex } from '../services/anterGeometryService'
import { computeAnterBom, type AnterBomElement, type AnterProductGeometry } from '../services/anterBomService'
import type { AnterConfiguratorPricingService } from '../services/anterConfiguratorPricingService'

const REVISION_RESOURCE_KIND = 'anter_configurator.revision'
const CATALOG_PRODUCT_ENTITY_ID = 'catalog:catalog_product'

function parseInput(rawInput: unknown): AnterRevisionComputeBomInput {
  const result = anterRevisionComputeBomSchema.safeParse(rawInput)
  if (!result.success) {
    throw new CrudHttpError(400, { error: '[internal] invalid anter_configurator.revision.compute_bom input', issues: result.error.issues })
  }
  return result.data
}

function readCf<T>(cf: Record<string, unknown> | undefined, key: string, fallback: T): T {
  const value = cf?.[`cf_${key}`]
  return value == null ? fallback : (value as T)
}

function toProductGeometry(productId: string, cf: Record<string, unknown> | undefined): AnterProductGeometry {
  return {
    productId,
    productVariantId: null,
    drawingKind: readCf(cf, 'anter_drawing_kind', 'none') as AnterProductGeometry['drawingKind'],
    moduleLengthM: cf?.cf_anter_module_length_m != null ? Number(cf.cf_anter_module_length_m) : null,
    moduleFitPolicy: readCf(cf, 'anter_module_fit_policy', 'round_down') as AnterProductGeometry['moduleFitPolicy'],
    postSku: readCf<string | null>(cf, 'anter_post_sku', null),
    postsPerRunExtra: cf?.cf_anter_posts_per_run_extra != null ? Number(cf.cf_anter_posts_per_run_extra) : 1,
    anchorSku: readCf<string | null>(cf, 'anter_anchor_sku', null),
    anchorsPerPost: cf?.cf_anter_anchors_per_post != null ? Number(cf.cf_anter_anchors_per_post) : 4,
    insertClearWidthM: cf?.cf_anter_insert_clear_width_m != null ? Number(cf.cf_anter_insert_clear_width_m) : null,
  }
}

function toBomElement(entity: AnterProjectElement): AnterBomElement | null {
  const geometry = entity.geometry as { vertices?: Vertex[]; position?: Vertex; rotation?: number }
  if (entity.elementKind === 'run') {
    if (!entity.productId || !Array.isArray(geometry.vertices)) return null
    return { id: entity.id, elementKind: 'run', productId: entity.productId, productVariantId: entity.productVariantId ?? null, vertices: geometry.vertices }
  }
  if (entity.elementKind === 'point') {
    if (!entity.productId || !geometry.position) return null
    return { id: entity.id, elementKind: 'point', productId: entity.productId, productVariantId: entity.productVariantId ?? null, position: geometry.position }
  }
  if (entity.elementKind === 'insert') {
    if (!entity.productId || !geometry.position || !entity.hostElementId || entity.hostOffsetRatio == null) return null
    return {
      id: entity.id,
      elementKind: 'insert',
      productId: entity.productId,
      productVariantId: entity.productVariantId ?? null,
      position: geometry.position,
      hostElementId: entity.hostElementId,
      hostOffsetRatio: Number(entity.hostOffsetRatio),
    }
  }
  return { id: entity.id, elementKind: 'annotation', productId: null, productVariantId: null }
}

type PersistedBomLine = {
  id: string
  productId: string
  productVariantId: string | null
  sku: string | null
  nameSnapshot: string
  origin: string
  sourceElementIds: string[]
  quantity: string
  unitCode: string
  realisedLengthM: string | null
  residualLengthM: string | null
  moduleCount: number | null
  postCount: number | null
  anchorCount: number | null
  listUnitPriceNet: string | null
  partnerUnitPriceNet: string | null
  discountRate: string | null
  unitCostNet: string | null
  priceState: string
  netAmount: string | null
}

type RevisionSnapshot = {
  bomComputedAt: string | null
  bomTotalNetAmount: string | null
  bomCurrencyCode: string | null
  hasUnpricedItems: boolean
  lines: PersistedBomLine[]
} | null

async function snapshotRevision(em: EntityManager, revisionId: string): Promise<RevisionSnapshot> {
  const revision = await em.findOne(AnterProjectRevision, { id: revisionId })
  if (!revision) return null
  const lines = await em.find(AnterBomLine, { revisionId })
  return {
    bomComputedAt: revision.bomComputedAt ? revision.bomComputedAt.toISOString() : null,
    bomTotalNetAmount: revision.bomTotalNetAmount ?? null,
    bomCurrencyCode: revision.bomCurrencyCode ?? null,
    hasUnpricedItems: revision.hasUnpricedItems,
    lines: lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productVariantId: line.productVariantId ?? null,
      sku: line.sku ?? null,
      nameSnapshot: line.nameSnapshot,
      origin: line.origin,
      sourceElementIds: line.sourceElementIds,
      quantity: line.quantity,
      unitCode: line.unitCode,
      realisedLengthM: line.realisedLengthM ?? null,
      residualLengthM: line.residualLengthM ?? null,
      moduleCount: line.moduleCount ?? null,
      postCount: line.postCount ?? null,
      anchorCount: line.anchorCount ?? null,
      listUnitPriceNet: line.listUnitPriceNet ?? null,
      partnerUnitPriceNet: line.partnerUnitPriceNet ?? null,
      discountRate: line.discountRate ?? null,
      unitCostNet: line.unitCostNet ?? null,
      priceState: line.priceState,
      netAmount: line.netAmount ?? null,
    })),
  }
}

export type RevisionComputeBomResult = {
  revisionId: string
  bomComputedAt: string
  bomTotalNetAmount: number
  bomCurrencyCode: string
  hasUnpricedItems: boolean
  lineCount: number
}

/**
 * `anter_configurator.revision.compute_bom` (spec §API Contracts, decision
 * C4): recomputes and freezes the BOM for one revision from its stored
 * elements. Server-authoritative — this is the ONLY place BOM lines are
 * written; the browser's own computation (Phase G) is advisory and
 * reconciles against this result.
 */
const revisionComputeBomCommand: CommandHandler<unknown, RevisionComputeBomResult> = {
  id: 'anter_configurator.revision.compute_bom',
  isUndoable: true,
  async prepare(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    return { before: await snapshotRevision(em, parsed.revisionId) }
  },
  async execute(rawInput, ctx) {
    const parsed = parseInput(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const scope = { organizationId: parsed.organizationId, tenantId: parsed.tenantId }

    const revision = await em.findOne(AnterProjectRevision, { id: parsed.revisionId, ...scope, deletedAt: null })
    if (!revision) throw new CrudHttpError(404, { error: '[internal] revision not found' })

    enforceCommandOptimisticLock({ resourceKind: REVISION_RESOURCE_KIND, resourceId: revision.id, current: revision.updatedAt, request: ctx.request })

    // Recompute is allowed in every revision state (spec §3.5 "recomputed on
    // the server on save, on submission, on adding to cart and on offer
    // issue") — only editing a submitted revision's ELEMENTS is forbidden
    // (C5), which the elements-replace route enforces, not this command.
    if (revision.metresPerUnit == null) {
      throw new CrudHttpError(422, { error: '[internal] revision has not been calibrated yet' })
    }

    const elementEntities = await em.find(AnterProjectElement, { revisionId: revision.id })
    const bomElements = elementEntities.map(toBomElement).filter((el): el is AnterBomElement => el !== null)

    const drawableProductIds = [...new Set(bomElements.filter((el) => el.productId).map((el) => el.productId as string))]
    const cfByProduct = drawableProductIds.length
      ? await loadCustomFieldValues({ em, entityId: CATALOG_PRODUCT_ENTITY_ID, recordIds: drawableProductIds })
      : {}
    const productGeometryByProductId: Record<string, AnterProductGeometry> = {}
    for (const productId of drawableProductIds) {
      productGeometryByProductId[productId] = toProductGeometry(productId, cfByProduct[productId])
    }

    let bomResult
    try {
      bomResult = computeAnterBom({ elements: bomElements, metresPerUnit: Number(revision.metresPerUnit), productGeometryByProductId })
    } catch (error) {
      if (error instanceof AnterGeometryError) {
        throw new CrudHttpError(422, { error: error.code, message: error.message })
      }
      throw error
    }

    // Derived (post/anchor) lines are keyed by SKU — resolve to a catalogue
    // product id in one batch query, per §Performance "one query per revision".
    const derivedSkus = [...new Set(bomResult.derivedLines.map((line) => line.sku))]
    const derivedProducts = derivedSkus.length
      ? await em.find(CatalogProduct, { organizationId: parsed.organizationId, tenantId: parsed.tenantId, sku: { $in: derivedSkus } })
      : []
    const productIdBySku = new Map(derivedProducts.map((product) => [product.sku, product.id]))
    const derivedProductIds = [...new Set(bomResult.derivedLines.map((line) => productIdBySku.get(line.sku)).filter((id): id is string => !!id))]

    const drawnProducts = drawableProductIds.length
      ? await em.find(CatalogProduct, { organizationId: parsed.organizationId, tenantId: parsed.tenantId, id: { $in: drawableProductIds } })
      : []
    const drawnProductById = new Map(drawnProducts.map((product) => [product.id, product]))
    const derivedProductById = new Map(derivedProducts.map((product) => [product.id, product]))

    const allPricedProductIds = [...new Set([...drawableProductIds, ...derivedProductIds])]
    const pricingService = ctx.container.resolve<AnterConfiguratorPricingService>('anterConfiguratorPricingService')
    const prices = await pricingService.resolveBomLinePrices({
      lines: allPricedProductIds.map((productId) => ({ productId })),
      customerEntityId: parsed.customerEntityId ?? null,
      currencyCode: parsed.currencyCode,
      scope,
    })

    const newLines: AnterBomLine[] = []
    let bomTotalNetAmount = 0
    let hasUnpricedItems = false

    for (const draft of bomResult.drawnLines) {
      const product = drawnProductById.get(draft.productId)
      const geometry = productGeometryByProductId[draft.productId]
      const price = prices.get(draft.productId)
      const netAmount = price?.priceState === 'priced' && price.partnerUnitPriceNet != null
        ? Math.round(price.partnerUnitPriceNet * draft.quantity * 10000) / 10000
        : null
      if (price?.priceState !== 'priced') hasUnpricedItems = true
      if (netAmount != null) bomTotalNetAmount += netAmount

      newLines.push(em.create(AnterBomLine, {
        id: randomUUID(),
        revisionId: revision.id,
        productId: draft.productId,
        productVariantId: draft.productVariantId,
        sku: product?.sku ?? null,
        nameSnapshot: product?.title ?? draft.productId,
        origin: draft.origin,
        sourceElementIds: draft.sourceElementIds,
        quantity: String(draft.quantity),
        unitCode: draft.unitCode,
        realisedLengthM: draft.realisedLengthM != null ? String(draft.realisedLengthM) : null,
        residualLengthM: draft.residualLengthM != null ? String(draft.residualLengthM) : null,
        moduleCount: draft.moduleCount,
        postCount: draft.postCount,
        anchorCount: draft.anchorCount,
        listUnitPriceNet: price?.listUnitPriceNet != null ? String(price.listUnitPriceNet) : null,
        partnerUnitPriceNet: price?.partnerUnitPriceNet != null ? String(price.partnerUnitPriceNet) : null,
        discountRate: price ? String(price.discountRate) : null,
        unitCostNet: geometry ? (cfByProduct[draft.productId]?.cf_anter_unit_cost_net != null ? String(cfByProduct[draft.productId]!.cf_anter_unit_cost_net) : null) : null,
        priceState: price?.priceState ?? 'to_quote',
        netAmount: netAmount != null ? String(netAmount) : null,
        organizationId: parsed.organizationId,
        tenantId: parsed.tenantId,
      }))
    }

    for (const draft of bomResult.derivedLines) {
      const productId = productIdBySku.get(draft.sku)
      if (!productId) continue // unresolved accessory SKU — skipped, not fatal (data-setup gap, not a drawing error)
      const product = derivedProductById.get(productId)
      const price = prices.get(productId)
      const netAmount = price?.priceState === 'priced' && price.partnerUnitPriceNet != null
        ? Math.round(price.partnerUnitPriceNet * draft.quantity * 10000) / 10000
        : null
      if (price?.priceState !== 'priced') hasUnpricedItems = true
      if (netAmount != null) bomTotalNetAmount += netAmount

      newLines.push(em.create(AnterBomLine, {
        id: randomUUID(),
        revisionId: revision.id,
        productId,
        productVariantId: null,
        sku: product?.sku ?? draft.sku,
        nameSnapshot: product?.title ?? draft.sku,
        origin: 'derived',
        sourceElementIds: draft.sourceElementIds,
        quantity: String(draft.quantity),
        unitCode: draft.unitCode,
        realisedLengthM: null,
        residualLengthM: null,
        moduleCount: null,
        postCount: null,
        anchorCount: null,
        listUnitPriceNet: price?.listUnitPriceNet != null ? String(price.listUnitPriceNet) : null,
        partnerUnitPriceNet: price?.partnerUnitPriceNet != null ? String(price.partnerUnitPriceNet) : null,
        discountRate: price ? String(price.discountRate) : null,
        unitCostNet: null,
        priceState: price?.priceState ?? 'to_quote',
        netAmount: netAmount != null ? String(netAmount) : null,
        organizationId: parsed.organizationId,
        tenantId: parsed.tenantId,
      }))
    }

    const computedAt = new Date()
    const roundedTotal = Math.round(bomTotalNetAmount * 10000) / 10000

    await withAtomicFlush(em, [
      async () => {
        const existing = await em.find(AnterBomLine, { revisionId: revision.id })
        for (const line of existing) em.remove(line)
      },
      () => {
        newLines.forEach((line) => em.persist(line))
        revision.bomComputedAt = computedAt
        revision.bomTotalNetAmount = String(roundedTotal)
        revision.bomCurrencyCode = parsed.currencyCode
        revision.hasUnpricedItems = hasUnpricedItems
      },
    ], { transaction: true, label: 'anter_configurator.revision.compute_bom' })

    return {
      revisionId: revision.id,
      bomComputedAt: computedAt.toISOString(),
      bomTotalNetAmount: roundedTotal,
      bomCurrencyCode: parsed.currencyCode,
      hasUnpricedItems,
      lineCount: newLines.length,
    }
  },
  buildLog: async ({ result, snapshots }) => ({
    actionLabel: 'Compute Anter configurator BOM',
    resourceKind: REVISION_RESOURCE_KIND,
    resourceId: result.revisionId,
    payload: { undo: { before: snapshots.before } },
  }),
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before: RevisionSnapshot }>(logEntry)
    const revisionId = logEntry?.resourceId ?? null
    const before = payload?.before
    if (!before || !revisionId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const revision = await em.findOne(AnterProjectRevision, { id: revisionId })
    if (!revision) return

    await withAtomicFlush(em, [
      async () => {
        const current = await em.find(AnterBomLine, { revisionId })
        for (const line of current) em.remove(line)
      },
      () => {
        for (const line of before.lines) {
          em.persist(em.create(AnterBomLine, {
            ...line,
            revisionId: revision.id,
            organizationId: revision.organizationId,
            tenantId: revision.tenantId,
          }))
        }
        revision.bomComputedAt = before.bomComputedAt ? new Date(before.bomComputedAt) : null
        revision.bomTotalNetAmount = before.bomTotalNetAmount
        revision.bomCurrencyCode = before.bomCurrencyCode
        revision.hasUnpricedItems = before.hasUnpricedItems
      },
    ], { transaction: true, label: 'anter_configurator.revision.compute_bom.undo' })
  },
}

registerCommand(revisionComputeBomCommand)

export default revisionComputeBomCommand
