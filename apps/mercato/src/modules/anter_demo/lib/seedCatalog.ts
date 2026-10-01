import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import {
  CatalogPriceKind,
  CatalogProduct,
  CatalogProductCategory,
} from '@open-mercato/core/modules/catalog/data/entities'
import { seedCatalogPriceKinds, seedCatalogUnits } from '@open-mercato/core/modules/catalog/lib/seeds'
import { SalesTaxRate } from '@open-mercato/core/modules/sales/data/entities'
import { seedSalesTaxRates } from '@open-mercato/core/modules/sales/lib/seeds'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import {
  ensureDefaultPartitions,
  resolveDefaultPartitionCode,
} from '@open-mercato/core/modules/attachments/lib/partitions'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'
import { mergeAttachmentMetadata } from '@open-mercato/core/modules/attachments/lib/metadata'
import {
  buildAttachmentFileUrl,
  buildAttachmentImageUrl,
  slugifyAttachmentFileName,
} from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { openXlsx } from './xlsx'
import type { AnterDemoScope, CatalogFixture, CatalogProductFixture } from './types'

const logger = createLogger('anter_demo')

export type CatalogSeedResult = {
  categories: number
  products: number
  variants: number
  prices: number
  images: number
  skipped: number
}

export type SeedCatalogOptions = {
  workbookPath?: string | null
  includeImages: boolean
}

function buildContext(container: AwilixContainer): CommandRuntimeContext {
  return {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: null,
    organizationIds: null,
    request: undefined as never,
    // Seeding is a trusted server-side call with no end-user actor.
    systemActor: true,
  } as CommandRuntimeContext
}

function detectMimeType(file: string): string {
  const extension = path.extname(file).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.gif') return 'image/gif'
  if (extension === '.webp') return 'image/webp'
  return 'image/png'
}

async function ensurePartition(em: EntityManager, code: string): Promise<AttachmentPartition> {
  let partition = await em.findOne(AttachmentPartition, { code })
  if (!partition) {
    await ensureDefaultPartitions(em)
    partition = await em.findOne(AttachmentPartition, { code })
  }
  if (!partition) throw new Error(`[internal] attachment partition "${code}" is not configured`)
  return partition
}

/**
 * Product photos are embedded in the source spreadsheet rather than shipped as
 * loose files, so the seed opens the committed workbook and pulls the bytes out
 * of it. A missing workbook downgrades to a warning: the catalogue is still
 * usable without pictures.
 */
async function loadWorkbookImages(workbookPath: string | null | undefined): Promise<Map<string, Buffer> | null> {
  if (!workbookPath) return null
  let buffer: Buffer
  try {
    buffer = await fs.readFile(workbookPath)
  } catch {
    logger.warn('anter_demo.seed source workbook not found; seeding catalogue without images', { workbookPath })
    return null
  }
  const archive = openXlsx(buffer)
  return archive.files
}

async function attachProductImage(
  em: EntityManager,
  scope: AnterDemoScope,
  entityId: string,
  productId: string,
  title: string,
  file: string,
  bytes: Buffer,
): Promise<{ id: string; imageUrl: string }> {
  const partitionCode = resolveDefaultPartitionCode(entityId)
  const partition = await ensurePartition(em, partitionCode)
  const fileName = `${slugifyAttachmentFileName(title, 'product')}${path.extname(file) || '.png'}`
  const stored = await storePartitionFile({
    partitionCode: partition.code,
    orgId: scope.organizationId,
    tenantId: scope.tenantId,
    fileName,
    buffer: bytes,
  })
  const attachmentId = randomUUID()
  const attachment = em.create(Attachment, {
    id: attachmentId,
    entityId,
    recordId: productId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    partitionCode: partition.code,
    fileName,
    mimeType: detectMimeType(file),
    fileSize: bytes.length,
    storageDriver: partition.storageDriver || 'local',
    storagePath: stored.storagePath,
    storageMetadata: mergeAttachmentMetadata(null, {
      assignments: [{ type: entityId, id: productId }],
    }),
    url: buildAttachmentFileUrl(attachmentId),
  })
  em.persist(attachment)
  await em.flush()
  return {
    id: attachmentId,
    imageUrl: buildAttachmentImageUrl(attachmentId, {
      width: 800,
      height: 800,
      slug: slugifyAttachmentFileName(fileName),
    }),
  }
}

export async function seedAnterCatalog(
  em: EntityManager,
  container: AwilixContainer,
  scope: AnterDemoScope,
  fixture: CatalogFixture,
  options: SeedCatalogOptions,
): Promise<CatalogSeedResult> {
  const commandBus = container.resolve('commandBus') as CommandBus
  const ctx = buildContext(container)
  const result: CatalogSeedResult = { categories: 0, products: 0, variants: 0, prices: 0, images: 0, skipped: 0 }

  const findPriceKind = () =>
    em.findOne(CatalogPriceKind, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      code: 'regular',
    })

  // During `mercato init` the catalog's own seedDefaults has already run, but
  // the standalone CLI can be pointed at a bare organization. Both catalog
  // seeders are idempotent, so bootstrapping here is cheap and keeps the seed
  // usable on its own.
  let priceKind = await findPriceKind()
  if (!priceKind) {
    await seedCatalogUnits(em, scope)
    await seedCatalogPriceKinds(em, scope)
    await em.flush()
    priceKind = await findPriceKind()
  }
  if (!priceKind) {
    throw new Error('[internal] catalog price kind "regular" could not be created for this organization')
  }

  // The sales module seeds VAT rates per organization; link products to the one
  // matching the fixture instead of only stamping the scalar, so the admin UI
  // shows a configured tax rate rather than a bare number. Bootstrap them for
  // the same reason as the price kinds above — the seeder is also run against
  // organizations that never went through `mercato init`.
  const findTaxRates = () =>
    em.find(SalesTaxRate, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    })
  const matches = (rates: SalesTaxRate[]) =>
    rates.find((rate) => Number(rate.rate) === fixture.taxRate)?.id ?? null

  let taxRateId = matches(await findTaxRates())
  if (!taxRateId) {
    await seedSalesTaxRates(em, scope)
    await em.flush()
    taxRateId = matches(await findTaxRates())
  }
  if (!taxRateId) {
    logger.warn('anter_demo.seed no matching tax rate; products keep the scalar rate only', {
      rate: fixture.taxRate,
    })
  }

  // --- categories -----------------------------------------------------------
  const categoryIds = new Map<string, string>()
  const roots = fixture.categories.filter((category) => !category.parentKey)
  const children = fixture.categories.filter((category) => category.parentKey)
  for (const category of [...roots, ...children]) {
    const existing = await em.findOne(CatalogProductCategory, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      slug: category.slug,
      deletedAt: null,
    })
    if (existing) {
      categoryIds.set(category.key, existing.id)
      continue
    }
    const { result: created } = await commandBus.execute('catalog.categories.create', {
      input: {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        name: category.name,
        slug: category.slug,
        isActive: true,
        ...(category.parentKey ? { parentId: categoryIds.get(category.parentKey) } : {}),
      },
      ctx,
    })
    const id = (created as { categoryId?: string; id?: string })?.categoryId ?? (created as { id?: string })?.id
    if (id) {
      categoryIds.set(category.key, id)
      result.categories += 1
    }
  }

  // --- products -------------------------------------------------------------
  const workbookFiles = options.includeImages ? await loadWorkbookImages(options.workbookPath) : null

  for (const product of fixture.products) {
    const existing = await em.findOne(CatalogProduct, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      handle: product.handle,
      deletedAt: null,
    })
    if (existing) {
      result.skipped += 1
      continue
    }
    const productId = await createProduct(product)
    if (!productId) continue
    result.products += 1

    if (product.variants.length) {
      for (const variant of product.variants) {
        const { result: createdVariant } = await commandBus.execute('catalog.variants.create', {
          input: {
            organizationId: scope.organizationId,
            tenantId: scope.tenantId,
            productId,
            name: variant.name,
            sku: variant.sku,
            isDefault: variant.isDefault,
            isActive: true,
            optionValues: variant.optionValues,
            ...(variant.dimensions ? { dimensions: variant.dimensions } : {}),
            metadata: variant.metadata,
          },
          ctx,
        })
        const variantId =
          (createdVariant as { variantId?: string; id?: string })?.variantId ??
          (createdVariant as { id?: string })?.id
        result.variants += 1
        await createPrice(productId, variantId ?? null, variant.price)
        result.prices += 1
      }
    } else {
      await createPrice(productId, null, product.price)
      result.prices += 1
    }

    if (workbookFiles && product.image) {
      const bytes = workbookFiles.get(product.image.file)
      if (bytes) {
        const media = await attachProductImage(
          em,
          scope,
          'catalog:catalog_product',
          productId,
          product.title,
          product.image.file,
          bytes,
        )
        await commandBus.execute('catalog.products.update', {
          input: {
            organizationId: scope.organizationId,
            tenantId: scope.tenantId,
            id: productId,
            defaultMediaId: media.id,
            defaultMediaUrl: media.imageUrl,
          },
          ctx,
        })
        result.images += 1
      }
    }
  }

  return result

  async function createProduct(product: CatalogProductFixture): Promise<string | null> {
    const categoryId = categoryIds.get(product.categoryKey)
    const { result: created } = await commandBus.execute('catalog.products.create', {
      input: {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        title: product.title,
        ...(product.subtitle ? { subtitle: product.subtitle } : {}),
        description: product.description,
        sku: product.sku,
        handle: product.handle,
        productType: product.isConfigurable ? 'configurable' : 'simple',
        primaryCurrencyCode: fixture.currencyCode,
        taxRate: fixture.taxRate,
        ...(taxRateId ? { taxRateId } : {}),
        isActive: true,
        ...(categoryId ? { categoryIds: [categoryId] } : {}),
        metadata: product.metadata,
        ...(product.optionSchema ? { optionSchema: product.optionSchema } : {}),
      },
      ctx,
    })
    return (created as { productId?: string; id?: string })?.productId ?? (created as { id?: string })?.id ?? null
  }

  async function createPrice(productId: string, variantId: string | null, net: number): Promise<void> {
    const gross = Math.round(net * (1 + fixture.taxRate / 100) * 100) / 100
    await commandBus.execute('catalog.prices.create', {
      input: {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        productId,
        ...(variantId ? { variantId } : {}),
        currencyCode: fixture.currencyCode,
        priceKindId: priceKind!.id,
        minQuantity: 1,
        unitPriceNet: net,
        unitPriceGross: gross,
        taxRate: fixture.taxRate,
      },
      ctx,
    })
  }
}
