import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { loadCustomFieldValues } from '@open-mercato/shared/lib/crud/custom-fields'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import { CatalogProduct } from '@open-mercato/core/modules/catalog/data/entities'
import { resolveAnterConfiguratorCommandContext } from '../../lib/staffCommandContext'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['anter_configurator.internal'] } }

const CATALOG_PRODUCT_ENTITY_ID = 'catalog:catalog_product'

/**
 * Internal mode's product panel (spec §3.7): the full catalogue, never
 * filtered by a partner's price-list scope — s9's dashed rendering marks an
 * out-of-scope element without hiding it (the mode ladder never hides an
 * element a colleague drew).
 */
export async function GET(req: Request) {
  const { container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
  const em = container.resolve('em') as EntityManager

  const drawingKindValues = await em.find(CustomFieldValue, {
    entityId: CATALOG_PRODUCT_ENTITY_ID,
    fieldKey: 'anter_drawing_kind',
    deletedAt: null,
    valueText: { $in: ['line', 'point', 'insert'] },
  })
  const productIds = [...new Set(drawingKindValues.map((value) => value.recordId))]
  if (!productIds.length) return NextResponse.json({ items: [] })

  const [products, cfByProduct] = await Promise.all([
    em.find(CatalogProduct, { id: { $in: productIds }, organizationId, tenantId, deletedAt: null }),
    loadCustomFieldValues({ em, entityId: CATALOG_PRODUCT_ENTITY_ID, recordIds: productIds }),
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
