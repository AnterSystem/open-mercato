import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CatalogProductCategory } from '@open-mercato/core/modules/catalog/data/entities'
import { resolveAnterPortalContext } from '../../lib/portalContext'
import { anterPortalTag, anterPortalErrorSchema } from '../openapi'

export const metadata = { GET: { requireAuth: false } }

const categorySchema = z.object({ id: z.string().uuid(), name: z.string() })

/**
 * Categories for the catalogue's filter select (s35) — portal-facing because
 * `catalog.categories` itself is staff-gated (`catalog.categories.view`),
 * which a customer session never carries.
 */
export async function GET(req: Request) {
  const contextOrResponse = await resolveAnterPortalContext(req, ['portal.catalog.view'])
  if (contextOrResponse instanceof Response) return contextOrResponse
  const context = contextOrResponse

  const em = context.em as EntityManager
  const categories = await em.find(CatalogProductCategory, {
    organizationId: context.organizationId,
    tenantId: context.tenantId,
    deletedAt: null,
  }, { orderBy: { name: 'asc' } })

  return NextResponse.json({ items: categories.map((category) => ({ id: category.id, name: category.name })) })
}

export const openApi: OpenApiRouteDoc = {
  tag: anterPortalTag,
  summary: 'Catalogue categories (for the s35 filter select)',
  methods: {
    GET: {
      summary: 'List catalogue categories',
      responses: [{ status: 200, description: 'Categories', schema: z.object({ items: z.array(categorySchema) }) }],
      errors: [{ status: 401, description: 'Unauthorized', schema: anterPortalErrorSchema }],
    },
  },
}
