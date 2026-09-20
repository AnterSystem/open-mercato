import type { CustomEntitySpec, CustomFieldDefinition } from '@open-mercato/shared/modules/entities'
import { E } from '@/.mercato/generated/entities.ids.generated'

/**
 * Product geometry layer (spec §3.3, decision C11): drawing kind, module
 * length, post/anchor SKUs and quantities, insert clear width, impact energy,
 * mounting conditions and internal unit cost — added to the CATALOGUE product
 * record as custom fields rather than a configurator-private library, so
 * there is exactly one place to edit a product. A product with
 * `anter_drawing_kind = 'none'` (the default) cannot be drawn and stays
 * orderable from the catalogue unchanged.
 *
 * `anter_unit_cost_net` is read only under `anter_configurator.margin.view`
 * (§3.7) and MUST never be added to the portal catalogue API's field list —
 * that projection is owned by the companion spec and this field is
 * deliberately not part of it (§Risks R6).
 */
const productGeometryFields = [
  {
    key: 'anter_drawing_kind',
    kind: 'select',
    label: 'Drawing kind',
    description: 'What the configurator draws this product as. "none" keeps the product catalogue-only.',
    options: [
      { value: 'none', label: 'Not drawable' },
      { value: 'line', label: 'Line (run)' },
      { value: 'point', label: 'Point' },
      { value: 'insert', label: 'Insert (gate)' },
    ],
    defaultValue: 'none',
    filterable: true,
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry', title: 'Configurator geometry' },
  },
  {
    key: 'anter_module_length_m',
    kind: 'float',
    label: 'Module length (m)',
    description: 'Length of one module — line products only.',
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
  {
    key: 'anter_module_fit_policy',
    kind: 'select',
    label: 'Module fit policy',
    options: [
      { value: 'round_down', label: 'Round down' },
      { value: 'round_up', label: 'Round up' },
      { value: 'nearest', label: 'Nearest' },
    ],
    defaultValue: 'round_down',
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
  {
    key: 'anter_post_sku',
    kind: 'text',
    label: 'Post SKU',
    description: 'Catalogue SKU of the post consumed per joint.',
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
  {
    key: 'anter_posts_per_run_extra',
    kind: 'integer',
    label: 'Extra posts per open run',
    defaultValue: 1,
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
  {
    key: 'anter_anchor_sku',
    kind: 'text',
    label: 'Anchor SKU',
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
  {
    key: 'anter_anchors_per_post',
    kind: 'integer',
    label: 'Anchors per post',
    defaultValue: 4,
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
  {
    key: 'anter_insert_clear_width_m',
    kind: 'float',
    label: 'Insert clear width (m)',
    description: 'The gap an insert (gate) occupies in its host run.',
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
  {
    key: 'anter_impact_energy_kj',
    kind: 'float',
    label: 'Impact energy (kJ)',
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
  {
    key: 'anter_mounting_conditions',
    kind: 'multiline',
    label: 'Mounting conditions',
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
  {
    key: 'anter_unit_cost_net',
    kind: 'currency',
    label: 'Unit cost (net)',
    description: 'Internal mode only — never served to the portal (spec §Risks R6).',
    formEditable: true,
    fieldset: 'anter_geometry',
    group: { code: 'anter_geometry' },
  },
] satisfies CustomFieldDefinition[]

export const entities: CustomEntitySpec[] = [
  {
    id: E.catalog.catalog_product,
    fields: productGeometryFields,
  },
]

export default entities
