import { z, type ZodTypeAny } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  createCrudOpenApiFactory,
  createPagedListResponseSchema as createSharedPagedListResponseSchema,
  type CrudOpenApiOptions,
} from '@open-mercato/shared/lib/openapi/crud'

export const anterConfiguratorTag = 'AnterConfigurator'

export const anterConfiguratorOkSchema = z.object({
  ok: z.literal(true),
})

export const anterConfiguratorCreatedSchema = z.object({
  id: z.string().uuid(),
})

export function createAnterConfiguratorPagedListResponseSchema(itemSchema: ZodTypeAny) {
  return createSharedPagedListResponseSchema(itemSchema, { paginationMetaOptional: true })
}

const buildAnterConfiguratorCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: anterConfiguratorTag,
  defaultCreateResponseSchema: anterConfiguratorCreatedSchema,
  defaultOkResponseSchema: anterConfiguratorOkSchema,
  makeListDescription: ({ pluralLower }) =>
    `Returns a paginated collection of ${pluralLower} in the current tenant scope.`,
})

export function createAnterConfiguratorCrudOpenApi(options: CrudOpenApiOptions): OpenApiRouteDoc {
  return buildAnterConfiguratorCrudOpenApi(options)
}
