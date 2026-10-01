import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import {
  CatalogPriceKind,
  CatalogProduct,
  CatalogProductCategory,
} from '@open-mercato/core/modules/catalog/data/entities'
import {
  ANTER_GEOMETRY_FIELDSET_CODE,
  ensureGeometryFieldset,
} from '../../anter_configurator/setup'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { AnterDemoScope, GeometryFixture, GeometryProductFixture } from './types'

const logger = createLogger('anter_demo')

export type GeometrySeedResult = {
  productsCreated: number
  productsUpdated: number
  skipped: number
}

function buildContext(container: AwilixContainer): CommandRuntimeContext {
  return {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: null,
    organizationIds: null,
    request: undefined as never,
    systemActor: true,
  } as CommandRuntimeContext
}

const GEOMETRY_FIELD_KEYS = [
  'anter_drawing_kind',
  'anter_module_length_m',
  'anter_module_fit_policy',
  'anter_post_sku',
  'anter_posts_per_run_extra',
  'anter_anchor_sku',
  'anter_anchors_per_post',
  'anter_insert_clear_width_m',
  'anter_impact_energy_kj',
  'anter_mounting_conditions',
  'anter_unit_cost_net',
] as const

/**
 * Gives the demo catalogue the product geometry the configurator needs
 * (spec §3.3, Phase F step 2 — "seed values for the example products").
 *
 * Two things have to land together for a drawing to become a bill of
 * materials: the geometry values themselves, and the `anter_geometry`
 * fieldset that makes them editable on the product form. The fieldset lives
 * in `anter_configurator/setup.ts` because it is a module default rather than
 * demo data; it is re-ensured here so an existing tenant picks it up without
 * a re-init.
 *
 * Posts and anchors are created as real catalogue products: `anterBomService`
 * only emits post and anchor BOM lines when those SKUs resolve to a product,
 * and the source workbook has none.
 */
export async function seedAnterGeometry(
  em: EntityManager,
  container: AwilixContainer,
  scope: AnterDemoScope,
  fixture: GeometryFixture,
): Promise<GeometrySeedResult> {
  const commandBus = container.resolve('commandBus') as CommandBus
  const ctx = buildContext(container)
  const result: GeometrySeedResult = { productsCreated: 0, productsUpdated: 0, skipped: 0 }

  await ensureGeometryFieldset(em, scope)

  for (const product of fixture.products) {
    const created = await ensureAccessoryProduct(product)
    if (created) result.productsCreated += 1
    else result.skipped += 1
  }

  for (const entry of fixture.geometry) {
    const product = await em.findOne(CatalogProduct, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      sku: entry.sku,
      deletedAt: null,
    })
    if (!product) {
      logger.warn('anter_demo.seed geometry target product not found; skipping', { sku: entry.sku })
      result.skipped += 1
      continue
    }

    const customFields: Record<string, unknown> = {}
    for (const key of GEOMETRY_FIELD_KEYS) {
      const value = (entry as Record<string, unknown>)[key]
      if (value !== undefined) customFields[key] = value
    }

    await commandBus.execute('catalog.products.update', {
      input: {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        id: product.id,
        customFieldsetCode: ANTER_GEOMETRY_FIELDSET_CODE,
        customFields,
      },
      ctx,
    })
    result.productsUpdated += 1
  }

  return result

  async function ensureAccessoryProduct(product: GeometryProductFixture): Promise<boolean> {
    const existing = await em.findOne(CatalogProduct, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      sku: product.sku,
      deletedAt: null,
    })
    if (existing) return false

    const category = await em.findOne(CatalogProductCategory, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      name: product.categoryKey,
      deletedAt: null,
    })
    const priceKind = await em.findOne(CatalogPriceKind, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      deletedAt: null,
    })

    const { result: created } = await commandBus.execute('catalog.products.create', {
      input: {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        title: product.title,
        description: product.description,
        sku: product.sku,
        handle: product.handle,
        productType: 'simple',
        primaryCurrencyCode: fixture.currencyCode,
        taxRate: fixture.taxRate,
        isActive: true,
        ...(category ? { categoryIds: [category.id] } : {}),
      },
      ctx,
    })
    const productId =
      (created as { productId?: string; id?: string })?.productId ?? (created as { id?: string })?.id ?? null
    if (!productId) return false

    if (priceKind) {
      const gross = Math.round(product.price * (1 + fixture.taxRate / 100) * 100) / 100
      await commandBus.execute('catalog.prices.create', {
        input: {
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
          productId,
          currencyCode: fixture.currencyCode,
          priceKindId: priceKind.id,
          minQuantity: 1,
          unitPriceNet: product.price,
          unitPriceGross: gross,
          taxRate: fixture.taxRate,
        },
        ctx,
      })
    }
    return true
  }
}
