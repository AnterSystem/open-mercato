import { NextResponse } from 'next/server'
import { loadCustomFieldValues } from '@open-mercato/shared/lib/crud/custom-fields'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import { CatalogProduct } from '@open-mercato/core/modules/catalog/data/entities'
import { resolveAnterConfiguratorPortalContext } from '../../../lib/portalContext'

export const metadata = { GET: { requireAuth: false } }

const CATALOG_PRODUCT_ENTITY_ID = 'catalog:catalog_product'

/**
 * The configurator's product panel (spec §UI/UX). A product with
 * `anter_drawing_kind = 'none'` cannot be drawn and stays catalogue-only
 * (§3.3) — this is the one place that filter is applied. Returns the full
 * geometry field set so the client's `computeAnterBom` preview (R2) can
 * match the server's arithmetic exactly.
 */
export async function GET(req: Request) {
  const contextOrResponse = await resolveAnterConfiguratorPortalContext(req, ['portal.configurator.use'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const drawingKindValues = await context.em.find(CustomFieldValue, {
    entityId: CATALOG_PRODUCT_ENTITY_ID,
    fieldKey: 'anter_drawing_kind',
    deletedAt: null,
    valueText: { $in: ['line', 'point', 'insert'] },
  })
  const productIds = [...new Set(drawingKindValues.map((value) => value.recordId))]
  if (!productIds.length) return NextResponse.json({ items: [] })

  const [products, cfByProduct] = await Promise.all([
    context.em.find(CatalogProduct, {
      id: { $in: productIds },
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      deletedAt: null,
    }),
    loadCustomFieldValues({ em: context.em, entityId: CATALOG_PRODUCT_ENTITY_ID, recordIds: productIds }),
  ])

  return NextResponse.json({
    items: products.map((product) => {
      const cf = cfByProduct[product.id] ?? {}
      return {
        id: product.id,
        title: product.title,
        drawingKind: cf.cf_anter_drawing_kind ?? 'none',
        moduleLengthM: cf.cf_anter_module_length_m != null ? Number(cf.cf_anter_module_length_m) : null,
        moduleFitPolicy: cf.cf_anter_module_fit_policy ?? 'round_down',
        postSku: cf.cf_anter_post_sku ?? null,
        postsPerRunExtra: cf.cf_anter_posts_per_run_extra != null ? Number(cf.cf_anter_posts_per_run_extra) : 1,
        anchorSku: cf.cf_anter_anchor_sku ?? null,
        anchorsPerPost: cf.cf_anter_anchors_per_post != null ? Number(cf.cf_anter_anchors_per_post) : 4,
        insertClearWidthM: cf.cf_anter_insert_clear_width_m != null ? Number(cf.cf_anter_insert_clear_width_m) : null,
      }
    }),
  })
}
