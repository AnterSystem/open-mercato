import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CustomerUserService } from '@open-mercato/core/modules/customer_accounts/services/customerUserService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { seedAnterCatalog, type CatalogSeedResult } from './seedCatalog'
import { seedAnterGeometry, type GeometrySeedResult } from './seedGeometry'
import {
  resolveExistingCustomerRefs,
  seedAnterCustomers,
  seedAnterPortalUsers,
  type CustomersSeedResult,
  type PortalUsersSeedResult,
} from './seedCustomers'
import { seedAnterOperations, type AnterSeedResult } from './seedAnter'
import {
  seedAnterConfigurator,
  seedAnterPortalCarts,
  type ConfiguratorSeedResult,
  type PortalCartSeedResult,
} from './seedPortalAndConfigurator'
import type {
  AnterDemoScope,
  AnterFixture,
  CatalogFixture,
  CustomersFixture,
  GeometryFixture,
  PortalUserFixture,
} from './types'
import catalogFixture from '../seed/catalog.json'
import geometryFixture from '../seed/configurator-geometry.json'
import customersFixture from '../seed/customers.json'
import portalUsersFixture from '../seed/portal-users.json'
import anterFixture from '../seed/anter.json'

const logger = createLogger('anter_demo')

/** Default login for every seeded portal account; override per environment. */
export const DEFAULT_PORTAL_PASSWORD = 'secret'

export type AnterDemoSeedOptions = {
  includeCatalog?: boolean
  includeGeometry?: boolean
  includeCustomers?: boolean
  includePortalUsers?: boolean
  includeAnter?: boolean
  includeCarts?: boolean
  includeConfigurator?: boolean
  includeImages?: boolean
  portalPassword?: string
  workbookPath?: string | null
}

export type AnterDemoSeedSummary = {
  catalog: CatalogSeedResult | null
  geometry: GeometrySeedResult | null
  customers: CustomersSeedResult | null
  portalUsers: PortalUsersSeedResult | null
  anter: AnterSeedResult | null
  carts: PortalCartSeedResult | null
  configurator: ConfiguratorSeedResult | null
}

/**
 * Locates the committed source spreadsheet that carries the product photos.
 * Only the images are read from it — product data itself lives in the
 * generated `seed/catalog.json` fixture so it stays reviewable in a diff.
 */
export async function resolveWorkbookPath(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit
  const relative = (catalogFixture as CatalogFixture).source
  let directory = process.cwd()
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(directory, relative)
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      const parent = path.dirname(directory)
      if (parent === directory) break
      directory = parent
    }
  }
  return null
}

/**
 * Resolves a file that ships inside this module (seed media, fixture output).
 * The CLI is bundled as ESM, so `__dirname` is unavailable — walk up from the
 * working directory instead, which covers both repo root and `apps/mercato`.
 */
export async function resolveModuleAsset(relative: string): Promise<string | null> {
  const candidates = [
    path.join('apps', 'mercato', 'src', 'modules', 'anter_demo', relative),
    path.join('src', 'modules', 'anter_demo', relative),
  ]
  let directory = process.cwd()
  for (let depth = 0; depth < 6; depth += 1) {
    for (const candidate of candidates) {
      const full = path.join(directory, candidate)
      try {
        await fs.access(full)
        return full
      } catch {
        // try the next candidate / parent directory
      }
    }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return null
}

export async function seedAnterDemoData(
  em: EntityManager,
  container: AwilixContainer,
  scope: AnterDemoScope,
  options: AnterDemoSeedOptions = {},
): Promise<AnterDemoSeedSummary> {
  const {
    includeCatalog = true,
    includeGeometry = true,
    includeCustomers = true,
    includePortalUsers = true,
    includeAnter = true,
    includeCarts = true,
    includeConfigurator = true,
    includeImages = true,
    portalPassword = DEFAULT_PORTAL_PASSWORD,
  } = options

  const catalog = catalogFixture as CatalogFixture
  const geometry = geometryFixture as GeometryFixture
  const customers = customersFixture as CustomersFixture
  const portalUsers = portalUsersFixture as PortalUserFixture[]
  const anter = anterFixture as AnterFixture

  const summary: AnterDemoSeedSummary = {
    catalog: null, geometry: null, customers: null, portalUsers: null, anter: null, carts: null, configurator: null,
  }

  if (includeCatalog) {
    const workbookPath = includeImages ? await resolveWorkbookPath(options.workbookPath) : null
    if (includeImages && !workbookPath) {
      logger.warn('anter_demo.seed source workbook not found; catalogue will be seeded without images', {
        expected: catalog.source,
      })
    }
    summary.catalog = await seedAnterCatalog(em, container, scope, catalog, {
      workbookPath,
      includeImages: includeImages && Boolean(workbookPath),
    })
  }

  if (includeGeometry) {
    summary.geometry = await seedAnterGeometry(em, container, scope, geometry)
  }

  let refs = { companyRefs: new Map<string, string>(), personRefs: new Map<string, string>() }
  if (includeCustomers) {
    const seeded = await seedAnterCustomers(em, container, scope, customers)
    summary.customers = seeded.result
    refs = { companyRefs: seeded.companyRefs, personRefs: seeded.personRefs }
  } else if (includePortalUsers || includeAnter || includeCarts || includeConfigurator) {
    refs = await resolveExistingCustomerRefs(em, scope, customers)
  }

  if (includePortalUsers) {
    summary.portalUsers = await seedAnterPortalUsers(em, container, scope, portalUsers, refs, portalPassword)
  }

  if (includeAnter || includeCarts || includeConfigurator) {
    const userService = container.resolve('customerUserService') as CustomerUserService
    if (includeAnter) summary.anter = await seedAnterOperations(em, scope, anter, refs, userService)
    // Configurator runs before carts: a cart line can reference a project revision.
    if (includeConfigurator) {
      summary.configurator = await seedAnterConfigurator(
        em, scope, anter.projects, anter.projectSequences, refs, userService,
      )
    }
    if (includeCarts) summary.carts = await seedAnterPortalCarts(em, scope, anter.carts, refs, userService)
  }

  return summary
}

export function formatSeedSummary(summary: AnterDemoSeedSummary): string {
  const lines: string[] = []
  if (summary.catalog) {
    const { categories, products, variants, prices, images, skipped } = summary.catalog
    lines.push(
      `catalog      categories=${categories} products=${products} variants=${variants} prices=${prices} images=${images} skipped=${skipped}`,
    )
  }
  if (summary.geometry) {
    const { productsCreated, productsUpdated, skipped } = summary.geometry
    lines.push(`geometry     productsCreated=${productsCreated} productsUpdated=${productsUpdated} skipped=${skipped}`)
  }
  if (summary.customers) {
    const { companies, people, skipped } = summary.customers
    lines.push(`customers    companies=${companies} people=${people} skipped=${skipped}`)
  }
  if (summary.portalUsers) {
    const { users, roles, skipped } = summary.portalUsers
    lines.push(`portal users users=${users} roles=${roles} skipped=${skipped}`)
  }
  if (summary.anter) {
    const a = summary.anter
    lines.push(
      `anter        terms=${a.partnerTerms} discounts=${a.groupDiscounts} stock=${a.stockItems} orders=${a.orders} lines=${a.orderLines} shipments=${a.shipments} shipmentLines=${a.shipmentLines} allocations=${a.allocations} invoices=${a.invoices} sequences=${a.sequences} skipped=${a.skipped}`,
    )
  }
  if (summary.configurator) {
    const c = summary.configurator
    lines.push(
      `configurator projects=${c.projects} revisions=${c.revisions} underlays=${c.underlays} sequences=${c.sequences} skipped=${c.skipped}`,
    )
  }
  if (summary.carts) {
    const c = summary.carts
    lines.push(`portal cart  carts=${c.carts} lines=${c.cartLines} skipped=${c.skipped}`)
  }
  return lines.join('\n')
}
