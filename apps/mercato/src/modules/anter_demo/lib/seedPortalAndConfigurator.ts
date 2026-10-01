import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { EntityManager } from '@mikro-orm/postgresql'
import { AnterCart, AnterCartLine } from '../../anter_portal/data/entities'
import { AnterProject, AnterProjectRevision, AnterProjectSequence } from '../../anter_configurator/data/entities'
import { ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE } from '../../anter_configurator/setup'
import { CatalogProduct, CatalogProductVariant } from '@open-mercato/core/modules/catalog/data/entities'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { ensureDefaultPartitions } from '@open-mercato/core/modules/attachments/lib/partitions'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'
import { mergeAttachmentMetadata } from '@open-mercato/core/modules/attachments/lib/metadata'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import type { CustomerUserService } from '@open-mercato/core/modules/customer_accounts/services/customerUserService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { AnterCartFixture, AnterDemoScope, AnterProjectFixture } from './types'
import type { EntityRefs } from './seedCustomers'
import { resolveModuleAsset } from './seeds'

const logger = createLogger('anter_demo')

export type PortalCartSeedResult = { carts: number; cartLines: number; skipped: number }
export type ConfiguratorSeedResult = {
  projects: number
  revisions: number
  sequences: number
  underlays: number
  skipped: number
}

type SkuIndexes = {
  productIdBySku: Map<string, string>
  variantIdBySku: Map<string, string>
}

async function loadSkuIndexes(em: EntityManager, scope: AnterDemoScope): Promise<SkuIndexes> {
  const base = { organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null }
  const products = await em.find(CatalogProduct, base)
  const variants = await em.find(CatalogProductVariant, base)
  return {
    productIdBySku: new Map(products.filter((p) => p.sku).map((p) => [p.sku as string, p.id])),
    variantIdBySku: new Map(variants.filter((v) => v.sku).map((v) => [v.sku as string, v.id])),
  }
}

export async function seedAnterPortalCarts(
  em: EntityManager,
  scope: AnterDemoScope,
  fixture: AnterCartFixture[],
  refs: { companyRefs: EntityRefs },
  userService: CustomerUserService,
): Promise<PortalCartSeedResult> {
  const result: PortalCartSeedResult = { carts: 0, cartLines: 0, skipped: 0 }
  if (!fixture.length) return result
  const base = { organizationId: scope.organizationId, tenantId: scope.tenantId }
  const { productIdBySku, variantIdBySku } = await loadSkuIndexes(em, scope)

  for (const cart of fixture) {
    const customerUser = cart.customerUserRef
      ? await userService.findByEmail(cart.customerUserRef, scope.tenantId)
      : null
    if (!customerUser) {
      logger.warn('anter_demo.seed cart portal user not found; skipping', { email: cart.customerUserRef })
      continue
    }
    const customerEntityId = cart.companyRef ? refs.companyRefs.get(cart.companyRef) ?? null : null
    if (!customerEntityId) {
      logger.warn('anter_demo.seed cart company not found; skipping', { companyRef: cart.companyRef })
      continue
    }
    // One active cart per portal user is the portal's own invariant; never add a second.
    const existing = await em.findOne(AnterCart, {
      ...base,
      customerUserId: customerUser.id,
      status: cart.status,
      deletedAt: null,
    })
    if (existing) {
      result.skipped += 1
      continue
    }
    const record = em.create(AnterCart, {
      ...base,
      customerEntityId,
      customerUserId: customerUser.id,
      currencyCode: cart.currencyCode,
      deliveryMode: cart.deliveryMode ?? null,
      deliveryAddressSnapshot: cart.deliveryAddressSnapshot ?? null,
      partnerReference: cart.partnerReference ?? null,
      notes: cart.notes ?? null,
      status: cart.status,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(record)
    await em.flush()
    result.carts += 1

    for (const line of cart.lines) {
      const productId = productIdBySku.get(line.productSku)
      if (!productId) {
        logger.warn('anter_demo.seed cart line product not found; skipping', { sku: line.productSku })
        continue
      }
      em.persist(em.create(AnterCartLine, {
        ...base,
        cartId: record.id,
        productId,
        productVariantId: line.variantSku ? variantIdBySku.get(line.variantSku) ?? null : null,
        sku: line.sku ?? null,
        nameSnapshot: line.nameSnapshot ?? null,
        variantSnapshot: line.variantSnapshot ?? null,
        quantity: String(line.quantity),
        unitCode: line.unitCode ?? null,
        listUnitPriceNet: line.listUnitPriceNet == null ? null : String(line.listUnitPriceNet),
        partnerUnitPriceNet: line.partnerUnitPriceNet == null ? null : String(line.partnerUnitPriceNet),
        discountRate: String(line.discountRate),
        currencyCode: line.currencyCode,
        priceResolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
      result.cartLines += 1
    }
    await em.flush()
  }

  return result
}

async function uploadUnderlay(
  em: EntityManager,
  scope: AnterDemoScope,
  fileName: string,
): Promise<string | null> {
  const mediaPath = await resolveModuleAsset(path.join('seed', 'media', fileName))
  let buffer: Buffer
  if (!mediaPath) {
    logger.warn('anter_demo.seed underlay media missing; revision seeded without a plan', { fileName })
    return null
  }
  try {
    buffer = await fs.readFile(mediaPath)
  } catch {
    logger.warn('anter_demo.seed underlay media unreadable; revision seeded without a plan', { mediaPath })
    return null
  }
  let partition = await em.findOne(AttachmentPartition, { code: ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE })
  if (!partition) {
    await ensureDefaultPartitions(em)
    partition = await em.findOne(AttachmentPartition, { code: ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE })
  }
  if (!partition) {
    logger.warn('anter_demo.seed underlay partition missing; revision seeded without a plan', {
      partition: ANTER_CONFIGURATOR_UNDERLAY_PARTITION_CODE,
    })
    return null
  }
  const stored = await storePartitionFile({
    partitionCode: partition.code,
    orgId: scope.organizationId,
    tenantId: scope.tenantId,
    fileName,
    buffer,
  })
  const attachmentId = randomUUID()
  em.persist(em.create(Attachment, {
    id: attachmentId,
    entityId: 'anter_configurator:anter_project_revision',
    recordId: attachmentId,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    partitionCode: partition.code,
    fileName,
    mimeType: 'image/png',
    fileSize: buffer.length,
    storageDriver: partition.storageDriver || 'local',
    storagePath: stored.storagePath,
    storageMetadata: mergeAttachmentMetadata(null, {}),
    url: buildAttachmentFileUrl(attachmentId),
  }))
  await em.flush()
  return attachmentId
}

export async function seedAnterConfigurator(
  em: EntityManager,
  scope: AnterDemoScope,
  projects: AnterProjectFixture[],
  sequences: Array<{ year: number; nextNumber: number }>,
  refs: { companyRefs: EntityRefs },
  userService: CustomerUserService,
): Promise<ConfiguratorSeedResult> {
  const result: ConfiguratorSeedResult = { projects: 0, revisions: 0, sequences: 0, underlays: 0, skipped: 0 }
  const base = { organizationId: scope.organizationId, tenantId: scope.tenantId }

  for (const project of projects) {
    const existing = await em.findOne(AnterProject, {
      ...base,
      projectNumber: project.projectNumber,
      deletedAt: null,
    })
    if (existing) {
      result.skipped += 1
      continue
    }
    const customerUser = project.customerUserRef
      ? await userService.findByEmail(project.customerUserRef, scope.tenantId)
      : null
    const customerEntityId = project.companyRef ? refs.companyRefs.get(project.companyRef) ?? null : null
    if (!customerUser || !customerEntityId) {
      logger.warn('anter_demo.seed configurator project owner not found; skipping', {
        project: project.projectNumber,
      })
      continue
    }

    const record = em.create(AnterProject, {
      ...base,
      projectNumber: project.projectNumber,
      name: project.name,
      customerEntityId,
      customerUserId: customerUser.id,
      origin: project.origin,
      status: project.status,
      siteAddressSnapshot: project.siteAddressSnapshot ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(record)
    await em.flush()
    result.projects += 1

    const revisionIdByLabel = new Map<string, string>()
    for (const revision of project.revisions) {
      const underlayAttachmentId = revision.underlayFile
        ? await uploadUnderlay(em, scope, revision.underlayFile)
        : null
      if (underlayAttachmentId) result.underlays += 1
      const created = em.create(AnterProjectRevision, {
        ...base,
        projectId: record.id,
        revisionLabel: revision.revisionLabel,
        state: revision.state,
        underlayAttachmentId,
        underlayWidthUnits: revision.underlayWidthUnits == null ? null : String(revision.underlayWidthUnits),
        underlayHeightUnits: revision.underlayHeightUnits == null ? null : String(revision.underlayHeightUnits),
        metresPerUnit: revision.metresPerUnit == null ? null : String(revision.metresPerUnit),
        calibrationPoints: revision.calibrationPoints ?? null,
        gridSizeM: revision.gridSizeM == null ? null : String(revision.gridSizeM),
        changeDescription: revision.changeDescription ?? null,
        bomTotalNetAmount: revision.bomTotalNetAmount == null ? null : String(revision.bomTotalNetAmount),
        bomCurrencyCode: revision.bomCurrencyCode ?? null,
        hasUnpricedItems: revision.hasUnpricedItems,
        technicalAcceptanceState: revision.technicalAcceptanceState ?? 'none',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      em.persist(created)
      await em.flush()
      revisionIdByLabel.set(revision.revisionLabel, created.id)
      result.revisions += 1
    }

    if (project.currentRevisionLabel) {
      record.currentRevisionId = revisionIdByLabel.get(project.currentRevisionLabel) ?? null
      await em.flush()
    }
  }

  for (const sequence of sequences) {
    const existing = await em.findOne(AnterProjectSequence, { ...base, year: sequence.year })
    if (existing) {
      // Same rule as order numbering: never rewind a live sequence.
      if (existing.nextNumber < sequence.nextNumber) existing.nextNumber = sequence.nextNumber
      result.skipped += 1
      continue
    }
    em.persist(em.create(AnterProjectSequence, {
      ...base,
      year: sequence.year,
      nextNumber: sequence.nextNumber,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    result.sequences += 1
  }

  await em.flush()
  return result
}
