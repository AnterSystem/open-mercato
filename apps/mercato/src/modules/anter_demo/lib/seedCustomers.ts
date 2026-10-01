import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CustomerRole, CustomerUserRole } from '@open-mercato/core/modules/customer_accounts/data/entities'
import type { CustomerUserService } from '@open-mercato/core/modules/customer_accounts/services/customerUserService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { AnterDemoScope, CustomersFixture, PortalUserFixture } from './types'

const logger = createLogger('anter_demo')

export type CustomersSeedResult = { companies: number; people: number; skipped: number }
export type PortalUsersSeedResult = { users: number; roles: number; skipped: number }

/** Maps a fixture ref (company domain / person email) to the created entity id. */
export type EntityRefs = Map<string, string>

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

function optional<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined || value === '' ? undefined : value
}

/**
 * `display_name` and `primary_email` are encrypted at rest with a per-value IV,
 * so an equality filter can never match. Load the scope's entities through the
 * decrypting finder once and match in memory instead — without this the seed
 * re-creates every company and contact on each run.
 */
async function loadEntityIndex(
  em: EntityManager,
  scope: AnterDemoScope,
  kind: 'company' | 'person',
): Promise<Map<string, CustomerEntity>> {
  const records = await findWithDecryption(
    em,
    CustomerEntity,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, kind, deletedAt: null },
    undefined,
    { tenantId: scope.tenantId, organizationId: scope.organizationId },
  )
  const index = new Map<string, CustomerEntity>()
  for (const record of records) {
    if (record.displayName) index.set(record.displayName.trim().toLowerCase(), record)
    if (record.primaryEmail) index.set(record.primaryEmail.trim().toLowerCase(), record)
  }
  return index
}

function lookupEntity(
  index: Map<string, CustomerEntity>,
  ...keys: Array<string | null | undefined>
): CustomerEntity | null {
  for (const key of keys) {
    if (!key) continue
    const found = index.get(key.trim().toLowerCase())
    if (found) return found
  }
  return null
}

export async function seedAnterCustomers(
  em: EntityManager,
  container: AwilixContainer,
  scope: AnterDemoScope,
  fixture: CustomersFixture,
): Promise<{ result: CustomersSeedResult; companyRefs: EntityRefs; personRefs: EntityRefs }> {
  const commandBus = container.resolve('commandBus') as CommandBus
  const ctx = buildContext(container)
  const result: CustomersSeedResult = { companies: 0, people: 0, skipped: 0 }
  const companyRefs: EntityRefs = new Map()
  const personRefs: EntityRefs = new Map()

  const companyIndex = await loadEntityIndex(em, scope, 'company')
  for (const company of fixture.companies) {
    const existing = lookupEntity(companyIndex, company.display_name, company.primary_email)
    if (existing) {
      companyRefs.set(company.ref, existing.id)
      result.skipped += 1
      continue
    }
    const { result: created } = await commandBus.execute('customers.companies.create', {
      input: {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        displayName: company.display_name,
        description: optional(company.description),
        primaryEmail: optional(company.primary_email),
        primaryPhone: optional(company.primary_phone),
        status: optional(company.status),
        lifecycleStage: optional(company.lifecycle_stage),
        legalName: optional(company.legal_name),
        brandName: optional(company.brand_name),
        domain: optional(company.domain),
        websiteUrl: optional(company.website_url),
        industry: optional(company.industry),
        sizeBucket: optional(company.size_bucket),
        annualRevenue: optional(company.annual_revenue),
        isActive: true,
      },
      ctx,
    })
    const id = (created as { entityId?: string; id?: string })?.entityId ?? (created as { id?: string })?.id
    if (id) {
      companyRefs.set(company.ref, id)
      result.companies += 1
    }
  }

  const personIndex = await loadEntityIndex(em, scope, 'person')
  for (const person of fixture.people) {
    const existing = lookupEntity(personIndex, person.primary_email, person.display_name)
    if (existing) {
      personRefs.set(person.ref, existing.id)
      result.skipped += 1
      continue
    }
    const companyEntityId = person.companyRef ? companyRefs.get(person.companyRef) : undefined
    const { result: created } = await commandBus.execute('customers.people.create', {
      input: {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        displayName: person.display_name,
        firstName: person.first_name ?? person.display_name.split(' ')[0],
        lastName: person.last_name ?? (person.display_name.split(' ').slice(1).join(' ') || person.display_name),
        description: optional(person.description),
        primaryEmail: optional(person.primary_email),
        primaryPhone: optional(person.primary_phone),
        status: optional(person.status),
        lifecycleStage: optional(person.lifecycle_stage),
        jobTitle: optional(person.job_title),
        ...(companyEntityId ? { companyEntityId } : {}),
        isActive: true,
      },
      ctx,
    })
    const id = (created as { entityId?: string; id?: string })?.entityId ?? (created as { id?: string })?.id
    if (id) {
      personRefs.set(person.ref, id)
      result.people += 1
    }
  }

  return { result, companyRefs, personRefs }
}

export async function seedAnterPortalUsers(
  em: EntityManager,
  container: AwilixContainer,
  scope: AnterDemoScope,
  fixture: PortalUserFixture[],
  refs: { companyRefs: EntityRefs; personRefs: EntityRefs },
  password: string,
): Promise<PortalUsersSeedResult> {
  const userService = container.resolve('customerUserService') as CustomerUserService
  const result: PortalUsersSeedResult = { users: 0, roles: 0, skipped: 0 }

  const roles = await em.find(CustomerRole, { tenantId: scope.tenantId, deletedAt: null })
  const rolesBySlug = new Map(roles.map((role) => [role.slug, role]))

  for (const entry of fixture) {
    const existing = await userService.findByEmail(entry.email, scope.tenantId)
    if (existing) {
      result.skipped += 1
      continue
    }
    const user = await userService.createUser(entry.email, password, entry.displayName, scope)
    user.customerEntityId = entry.companyRef ? refs.companyRefs.get(entry.companyRef) ?? null : null
    user.personEntityId = entry.personRef ? refs.personRefs.get(entry.personRef) ?? null : null
    user.isActive = entry.isActive
    if (entry.emailVerified) user.emailVerifiedAt = new Date()
    em.persist(user)
    await em.flush()
    result.users += 1

    for (const slug of entry.roles) {
      const role = rolesBySlug.get(slug)
      if (!role) {
        logger.warn('anter_demo.seed portal role missing; skipping assignment', { slug, email: entry.email })
        continue
      }
      em.persist(em.create(CustomerUserRole, { user, role, createdAt: new Date() }))
      result.roles += 1
    }
    await em.flush()
  }

  return result
}

export async function resolveExistingCustomerRefs(
  em: EntityManager,
  scope: AnterDemoScope,
  fixture: CustomersFixture,
): Promise<{ companyRefs: EntityRefs; personRefs: EntityRefs }> {
  const companyRefs: EntityRefs = new Map()
  const personRefs: EntityRefs = new Map()
  const companyIndex = await loadEntityIndex(em, scope, 'company')
  const personIndex = await loadEntityIndex(em, scope, 'person')
  for (const company of fixture.companies) {
    const found = lookupEntity(companyIndex, company.display_name, company.primary_email)
    if (found) companyRefs.set(company.ref, found.id)
  }
  for (const person of fixture.people) {
    const found = lookupEntity(personIndex, person.primary_email, person.display_name)
    if (found) personRefs.set(person.ref, found.id)
  }
  return { companyRefs, personRefs }
}
