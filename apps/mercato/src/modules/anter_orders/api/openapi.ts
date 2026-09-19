import { z, type ZodTypeAny } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  createCrudOpenApiFactory,
  createPagedListResponseSchema as createSharedPagedListResponseSchema,
  type CrudOpenApiOptions,
} from '@open-mercato/shared/lib/openapi/crud'

export const anterOrdersTag = 'AnterOrders'

export const anterOrdersOkSchema = z.object({
  ok: z.literal(true),
})

export const anterOrdersCreatedSchema = z.object({
  id: z.string().uuid(),
})

export function createAnterOrdersPagedListResponseSchema(itemSchema: ZodTypeAny) {
  return createSharedPagedListResponseSchema(itemSchema, { paginationMetaOptional: true })
}

const buildAnterOrdersCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: anterOrdersTag,
  defaultCreateResponseSchema: anterOrdersCreatedSchema,
  defaultOkResponseSchema: anterOrdersOkSchema,
  makeListDescription: ({ pluralLower }) =>
    `Returns a paginated collection of ${pluralLower} in the current tenant scope.`,
})

export function createAnterOrdersCrudOpenApi(options: CrudOpenApiOptions): OpenApiRouteDoc {
  return buildAnterOrdersCrudOpenApi(options)
}
