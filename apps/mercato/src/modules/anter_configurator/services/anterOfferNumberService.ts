import type { EntityManager } from '@mikro-orm/postgresql'

export type AnterOfferNumberScope = { organizationId: string; tenantId: string }

export type AnterOfferNumberService = {
  generate(scope: AnterOfferNumberScope, at?: Date): Promise<string>
}

const DEFAULT_SEQUENCE_START = 1
const MAX_SEQUENCE = 1_000_000_000

/**
 * `OF-YYYY-NNNN` offer numbers (spec §3.10/Data Model, `anter_offers`),
 * unique per tenant, assigned once at `offer.issue` — never at `offer.build`
 * (a `draft` offer carries no number, CC-4). Same atomic
 * `INSERT ... ON CONFLICT ... RETURNING` pattern as the sibling number
 * services in this module.
 */
export function createAnterOfferNumberService(deps: { em: EntityManager }): AnterOfferNumberService {
  const { em } = deps
  return {
    async generate(scope, at = new Date()) {
      const year = at.getUTCFullYear()
      const rows = await em.getConnection().execute<{ sequence: string }[]>(
        `
          insert into anter_offer_sequences (id, organization_id, tenant_id, year, next_number, created_at, updated_at)
          values (gen_random_uuid(), ?, ?, ?, ?, now(), now())
          on conflict (tenant_id, organization_id, year)
          do update set next_number = anter_offer_sequences.next_number + 1, updated_at = now()
          returning next_number - 1 as sequence
        `,
        [scope.organizationId, scope.tenantId, year, DEFAULT_SEQUENCE_START + 1],
      )
      const raw = Number(rows?.[0]?.sequence ?? DEFAULT_SEQUENCE_START)
      const sequence = Number.isFinite(raw) && raw >= DEFAULT_SEQUENCE_START
        ? Math.min(raw, MAX_SEQUENCE)
        : DEFAULT_SEQUENCE_START
      return `OF-${year}-${String(sequence).padStart(4, '0')}`
    },
  }
}

export default createAnterOfferNumberService
