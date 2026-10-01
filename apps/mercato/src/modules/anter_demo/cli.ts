import { writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import {
  DEFAULT_PORTAL_PASSWORD,
  formatSeedSummary,
  resolveModuleAsset,
  resolveWorkbookPath,
  seedAnterDemoData,
} from './lib/seeds'
import { readCatalogFixtureFromWorkbook } from './lib/buildCatalogFixture'

function parseArgs(rest: string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let index = 0; index < rest.length; index += 1) {
    const part = rest[index]
    if (!part?.startsWith('--')) continue
    const [key, inlineValue] = part.slice(2).split('=')
    if (inlineValue !== undefined) args[key] = inlineValue
    else if (rest[index + 1] && !rest[index + 1]!.startsWith('--')) {
      args[key] = rest[index + 1]!
      index += 1
    } else args[key] = 'true'
  }
  return args
}

async function dispose(container: { dispose?: () => Promise<void> }): Promise<void> {
  if (typeof container.dispose === 'function') await container.dispose()
}

const seedCommand: ModuleCli = {
  command: 'seed',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = String(args.tenantId ?? args.tenant ?? '')
    const organizationId = String(args.organizationId ?? args.org ?? args.orgId ?? '')
    if (!tenantId || !organizationId) {
      console.error(
        'Usage: mercato anter_demo seed --tenant <tenantId> --org <organizationId>\n' +
          '  [--only catalog,geometry,customers,portal-users,anter,configurator,carts]\n' +
          '                                                 seed just these sections\n' +
          '  [--images false]                               skip product photos\n' +
          '  [--portal-password <value>]                    password for seeded portal logins\n' +
          '  [--workbook <path>]                            override the source spreadsheet path',
      )
      return
    }

    const only = args.only ? args.only.split(',').map((part) => part.trim()).filter(Boolean) : null
    const enabled = (section: string) => (only ? only.includes(section) : true)

    const container = await createRequestContainer()
    try {
      const em = container.resolve<EntityManager>('em')
      const summary = await seedAnterDemoData(
        em,
        container,
        { tenantId, organizationId },
        {
          includeCatalog: enabled('catalog'),
          includeGeometry: enabled('geometry'),
          includeCustomers: enabled('customers'),
          includePortalUsers: enabled('portal-users'),
          includeAnter: enabled('anter'),
          includeConfigurator: enabled('configurator'),
          includeCarts: enabled('carts'),
          includeImages: parseBooleanWithDefault(args.images, true),
          portalPassword: args.portalPassword ?? args['portal-password'] ?? DEFAULT_PORTAL_PASSWORD,
          workbookPath: args.workbook ?? null,
        },
      )
      console.log(formatSeedSummary(summary))
      console.log('\nAnter demo data seeded for organization', organizationId)
    } finally {
      await dispose(container as { dispose?: () => Promise<void> })
    }
  },
}

/**
 * Regenerates `seed/catalog.json` from the committed source spreadsheet.
 * Development tool — run it after the product list changes, then review the
 * fixture diff before committing.
 */
const buildCatalogFixtureCommand: ModuleCli = {
  command: 'build-catalog-fixture',
  async run(rest) {
    const args = parseArgs(rest)
    const workbookPath = args.workbook ?? (await resolveWorkbookPath(null))
    if (!workbookPath) {
      console.error('Source workbook not found. Pass --workbook <path>.')
      return
    }
    const output = args.out ?? (await resolveModuleAsset(path.join('seed', 'catalog.json')))
    if (!output) {
      console.error('Could not locate seed/catalog.json. Pass --out <path>.')
      return
    }
    const fixture = readCatalogFixtureFromWorkbook(await readFile(workbookPath))
    await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`)
    console.log(
      `Wrote ${output}\n` +
        `  categories=${fixture.categories.length}` +
        ` products=${fixture.products.length}` +
        ` configurable=${fixture.products.filter((product) => product.isConfigurable).length}` +
        ` variants=${fixture.products.reduce((total, product) => total + product.variants.length, 0)}` +
        ` images=${fixture.products.filter((product) => product.image).length}`,
    )
  },
}

export default [seedCommand, buildCatalogFixtureCommand]
