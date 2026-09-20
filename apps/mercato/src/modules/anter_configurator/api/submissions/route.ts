import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveAnterConfiguratorCommandContext } from '../../lib/staffCommandContext'
import { listSubmissionsForStaff } from '../../lib/submissionAccess'
import { anterConfiguratorTag } from '../openapi'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['anter_configurator.view'] } }

/**
 * The queue's list source (spec s46, Implementation Plan step 34) — KPI
 * tiles and state-tab counts come from the SAME query as the rows so they
 * can never disagree with what's on screen.
 */
export async function GET(req: Request) {
  try {
    const { container, organizationId, tenantId } = await resolveAnterConfiguratorCommandContext(req)
    const em = (container.resolve('em') as EntityManager).fork()

    const url = new URL(req.url)
    const state = url.searchParams.get('state')?.trim() || undefined
    const track = url.searchParams.get('track')?.trim() || undefined
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 25))

    const result = await listSubmissionsForStaff(em, { organizationId, tenantId }, { state, track, page, pageSize })
    return NextResponse.json({ items: result.items, total: result.total, page, pageSize, kpi: result.kpi })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    throw err
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: anterConfiguratorTag,
  summary: 'List Anter configurator submissions (technical review queue)',
  methods: {
    GET: {
      summary: 'Paginated, filterable by state/track. Returns KPI counts by state.',
      responses: [{ status: 200, description: 'Submissions', schema: z.object({ items: z.array(z.unknown()), total: z.number(), page: z.number(), pageSize: z.number(), kpi: z.record(z.string(), z.number()) }) }],
    },
  },
}
