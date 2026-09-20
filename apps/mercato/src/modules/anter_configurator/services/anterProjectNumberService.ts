import type { EntityManager } from '@mikro-orm/postgresql'

export type AnterProjectNumberScope = {
  organizationId: string
  tenantId: string
}

export type AnterProjectNumberService = {
  generate(scope: AnterProjectNumberScope, at?: Date): Promise<string>
}

const DEFAULT_SEQUENCE_START = 1
const MAX_SEQUENCE = 1_000_000_000

/**
 * `KNF-P-YYYY-NNNN` project numbers, unique per tenant (spec Data Model,
 * `anter_projects`). Same atomic `INSERT ... ON CONFLICT ... RETURNING`
 * pattern as `anter_orders/services/anterOrderNumberService.ts` — avoids the
 * classic `count(*) + 1` race under concurrent project creation.
 */
export function createAnterProjectNumberService(deps: { em: EntityManager }): AnterProjectNumberService {
  const { em } = deps
  return {
    async generate(scope, at = new Date()) {
      const year = at.getUTCFullYear()
      const rows = await em.getConnection().execute<{ sequence: string }[]>(
        `
          insert into anter_project_sequences (id, organization_id, tenant_id, year, next_number, created_at, updated_at)
          values (gen_random_uuid(), ?, ?, ?, ?, now(), now())
          on conflict (tenant_id, organization_id, year)
          do update set next_number = anter_project_sequences.next_number + 1, updated_at = now()
          returning next_number - 1 as sequence
        `,
        [scope.organizationId, scope.tenantId, year, DEFAULT_SEQUENCE_START + 1],
      )
      const raw = Number(rows?.[0]?.sequence ?? DEFAULT_SEQUENCE_START)
      const sequence = Number.isFinite(raw) && raw >= DEFAULT_SEQUENCE_START
        ? Math.min(raw, MAX_SEQUENCE)
        : DEFAULT_SEQUENCE_START
      return `KNF-P-${year}-${String(sequence).padStart(4, '0')}`
    },
  }
}

export default createAnterProjectNumberService
