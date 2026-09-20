import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

@Entity({ tableName: 'anter_projects' })
@Index({ properties: ['customerEntityId'] })
export class AnterProject {
  [OptionalProps]?:
    | 'customerEntityId'
    | 'customerUserId'
    | 'customerDealId'
    | 'siteAddressSnapshot'
    | 'currentRevisionId'
    | 'status'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'project_number', type: 'text' })
  projectNumber!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'customer_entity_id', type: 'uuid', nullable: true })
  customerEntityId?: string | null

  @Property({ name: 'customer_user_id', type: 'uuid', nullable: true })
  customerUserId?: string | null

  @Property({ name: 'customer_deal_id', type: 'uuid', nullable: true })
  customerDealId?: string | null

  @Property({ type: 'text' })
  origin!: string

  // GDPR-relevant postal address (spec Data Model § Sensitive data) —
  // encrypted at rest per `encryption.ts`; read only through
  // `findWithDecryption` / `findOneWithDecryption`.
  @Property({ name: 'site_address_snapshot', type: 'jsonb', nullable: true })
  siteAddressSnapshot?: Record<string, unknown> | null

  @Property({ name: 'current_revision_id', type: 'uuid', nullable: true })
  currentRevisionId?: string | null

  @Property({ type: 'text', default: 'active' })
  status: string = 'active'

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'anter_project_sequences' })
@Unique({ properties: ['tenantId', 'organizationId', 'year'] })
export class AnterProjectSequence {
  [OptionalProps]?: 'nextNumber' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ type: 'integer' })
  year!: number

  @Property({ name: 'next_number', type: 'integer', default: 1 })
  nextNumber: number = 1

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'anter_project_revisions' })
@Index({ properties: ['projectId'] })
@Unique({ properties: ['projectId', 'revisionLabel'] })
export class AnterProjectRevision {
  [OptionalProps]?:
    | 'state'
    | 'underlayAttachmentId'
    | 'underlayWidthUnits'
    | 'underlayHeightUnits'
    | 'metresPerUnit'
    | 'calibrationPoints'
    | 'gridSizeM'
    | 'changeDescription'
    | 'bomComputedAt'
    | 'bomTotalNetAmount'
    | 'bomCurrencyCode'
    | 'hasUnpricedItems'
    | 'technicalAcceptanceState'
    | 'technicalAcceptedByUserId'
    | 'technicalAcceptedAt'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'project_id', type: 'uuid' })
  projectId!: string

  @Property({ name: 'revision_label', type: 'text' })
  revisionLabel!: string

  @Property({ type: 'text', default: 'draft' })
  state: string = 'draft'

  @Property({ name: 'underlay_attachment_id', type: 'uuid', nullable: true })
  underlayAttachmentId?: string | null

  @Property({ name: 'underlay_width_units', type: 'numeric', precision: 16, scale: 4, nullable: true })
  underlayWidthUnits?: string | null

  @Property({ name: 'underlay_height_units', type: 'numeric', precision: 16, scale: 4, nullable: true })
  underlayHeightUnits?: string | null

  // Two-point calibration (C5): metric length = length in plan units × this value.
  @Property({ name: 'metres_per_unit', type: 'numeric', precision: 16, scale: 8, nullable: true })
  metresPerUnit?: string | null

  @Property({ name: 'calibration_points', type: 'jsonb', nullable: true })
  calibrationPoints?: Record<string, unknown> | null

  @Property({ name: 'grid_size_m', type: 'numeric', precision: 8, scale: 4, default: '0.5' })
  gridSizeM: string = '0.5'

  @Property({ name: 'change_description', type: 'text', nullable: true })
  changeDescription?: string | null

  @Property({ name: 'bom_computed_at', type: Date, nullable: true })
  bomComputedAt?: Date | null

  @Property({ name: 'bom_total_net_amount', type: 'numeric', precision: 16, scale: 4, nullable: true })
  bomTotalNetAmount?: string | null

  @Property({ name: 'bom_currency_code', type: 'text', nullable: true })
  bomCurrencyCode?: string | null

  @Property({ name: 'has_unpriced_items', type: 'boolean', default: false })
  hasUnpricedItems: boolean = false

  @Property({ name: 'technical_acceptance_state', type: 'text', default: 'none' })
  technicalAcceptanceState: string = 'none'

  @Property({ name: 'technical_accepted_by_user_id', type: 'uuid', nullable: true })
  technicalAcceptedByUserId?: string | null

  @Property({ name: 'technical_accepted_at', type: Date, nullable: true })
  technicalAcceptedAt?: Date | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'anter_project_elements' })
@Index({ properties: ['revisionId'] })
@Index({ properties: ['hostElementId'] })
export class AnterProjectElement {
  [OptionalProps]?:
    | 'productId'
    | 'productVariantId'
    | 'skuSnapshot'
    | 'nameSnapshot'
    | 'hostElementId'
    | 'hostOffsetRatio'
    | 'label'
    | 'isOutsidePriceList'
    | 'sortOrder'
    | 'createdAt'
    | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'revision_id', type: 'uuid' })
  revisionId!: string

  @Property({ name: 'element_kind', type: 'text' })
  elementKind!: string

  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'product_variant_id', type: 'uuid', nullable: true })
  productVariantId?: string | null

  @Property({ name: 'sku_snapshot', type: 'text', nullable: true })
  skuSnapshot?: string | null

  @Property({ name: 'name_snapshot', type: 'text', nullable: true })
  nameSnapshot?: string | null

  // `{ vertices: [[x,y],...] }` for `run`; `{ position: [x,y], rotation }` for
  // `point` and `insert`; polyline or point for `annotation`.
  @Property({ type: 'jsonb' })
  geometry!: Record<string, unknown>

  @Property({ name: 'host_element_id', type: 'uuid', nullable: true })
  hostElementId?: string | null

  @Property({ name: 'host_offset_ratio', type: 'numeric', precision: 9, scale: 6, nullable: true })
  hostOffsetRatio?: string | null

  @Property({ type: 'text', nullable: true })
  label?: string | null

  @Property({ name: 'is_outside_price_list', type: 'boolean', default: false })
  isOutsidePriceList: boolean = false

  @Property({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number = 0

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'anter_plan_points' })
@Index({ properties: ['revisionId'] })
export class AnterPlanPoint {
  [OptionalProps]?: 'state' | 'skipReason' | 'coveredByElementId' | 'coverageRadiusM' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'revision_id', type: 'uuid' })
  revisionId!: string

  @Property({ name: 'point_kind', type: 'text' })
  pointKind!: string

  @Property({ type: 'jsonb' })
  position!: [number, number]

  @Property({ type: 'text', default: 'open' })
  state: string = 'open'

  @Property({ name: 'skip_reason', type: 'text', nullable: true })
  skipReason?: string | null

  @Property({ name: 'covered_by_element_id', type: 'uuid', nullable: true })
  coveredByElementId?: string | null

  @Property({ name: 'coverage_radius_m', type: 'numeric', precision: 8, scale: 4, default: '1.5' })
  coverageRadiusM: string = '1.5'

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'anter_bom_lines' })
@Index({ properties: ['revisionId'] })
export class AnterBomLine {
  [OptionalProps]?:
    | 'productVariantId'
    | 'sku'
    | 'realisedLengthM'
    | 'residualLengthM'
    | 'moduleCount'
    | 'postCount'
    | 'anchorCount'
    | 'listUnitPriceNet'
    | 'partnerUnitPriceNet'
    | 'discountRate'
    | 'unitCostNet'
    | 'netAmount'
    | 'createdAt'
    | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'revision_id', type: 'uuid' })
  revisionId!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'product_variant_id', type: 'uuid', nullable: true })
  productVariantId?: string | null

  @Property({ type: 'text', nullable: true })
  sku?: string | null

  @Property({ name: 'name_snapshot', type: 'text' })
  nameSnapshot!: string

  // `drawn` | `derived` | `manual` (spec §3.5 step 6).
  @Property({ type: 'text' })
  origin!: string

  // Which elements produced this line — the audit trail for a number nobody typed.
  @Property({ name: 'source_element_ids', type: 'jsonb' })
  sourceElementIds!: string[]

  @Property({ type: 'numeric', precision: 16, scale: 4 })
  quantity!: string

  @Property({ name: 'unit_code', type: 'text' })
  unitCode!: string

  @Property({ name: 'realised_length_m', type: 'numeric', precision: 16, scale: 4, nullable: true })
  realisedLengthM?: string | null

  @Property({ name: 'residual_length_m', type: 'numeric', precision: 16, scale: 4, nullable: true })
  residualLengthM?: string | null

  @Property({ name: 'module_count', type: 'integer', nullable: true })
  moduleCount?: number | null

  @Property({ name: 'post_count', type: 'integer', nullable: true })
  postCount?: number | null

  @Property({ name: 'anchor_count', type: 'integer', nullable: true })
  anchorCount?: number | null

  @Property({ name: 'list_unit_price_net', type: 'numeric', precision: 16, scale: 4, nullable: true })
  listUnitPriceNet?: string | null

  @Property({ name: 'partner_unit_price_net', type: 'numeric', precision: 16, scale: 4, nullable: true })
  partnerUnitPriceNet?: string | null

  @Property({ name: 'discount_rate', type: 'numeric', precision: 7, scale: 4, nullable: true })
  discountRate?: string | null

  // Internal mode only, gated by `anter_configurator.margin.view` (§3.7, R6).
  @Property({ name: 'unit_cost_net', type: 'numeric', precision: 16, scale: 4, nullable: true })
  unitCostNet?: string | null

  // `priced` | `to_quote` (§3.6).
  @Property({ name: 'price_state', type: 'text' })
  priceState!: string

  @Property({ name: 'net_amount', type: 'numeric', precision: 16, scale: 4, nullable: true })
  netAmount?: string | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'anter_custom_items' })
@Index({ properties: ['revisionId'] })
export class AnterCustomItem {
  [OptionalProps]?:
    | 'assignedConstructorUserId'
    | 'valuationState'
    | 'unitPriceNet'
    | 'pricedByUserId'
    | 'pricedAt'
    | 'forcedVariantOfProductId'
    | 'forcedByUserId'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'revision_id', type: 'uuid' })
  revisionId!: string

  @Property({ type: 'text' })
  description!: string

  @Property({ type: 'numeric', precision: 16, scale: 4 })
  quantity!: string

  @Property({ name: 'unit_code', type: 'text' })
  unitCode!: string

  @Property({ name: 'assigned_constructor_user_id', type: 'uuid', nullable: true })
  assignedConstructorUserId?: string | null

  @Property({ name: 'valuation_state', type: 'text', default: 'awaiting' })
  valuationState: string = 'awaiting'

  @Property({ name: 'unit_price_net', type: 'numeric', precision: 16, scale: 4, nullable: true })
  unitPriceNet?: string | null

  @Property({ name: 'priced_by_user_id', type: 'uuid', nullable: true })
  pricedByUserId?: string | null

  @Property({ name: 'priced_at', type: Date, nullable: true })
  pricedAt?: Date | null

  // §3.6 forcing path: converts this custom item into a priced line with a
  // hand-entered price and a permanent marker (internal mode only).
  @Property({ name: 'forced_variant_of_product_id', type: 'uuid', nullable: true })
  forcedVariantOfProductId?: string | null

  @Property({ name: 'forced_by_user_id', type: 'uuid', nullable: true })
  forcedByUserId?: string | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'anter_submission_sequences' })
@Unique({ properties: ['tenantId', 'organizationId', 'year'] })
export class AnterSubmissionSequence {
  [OptionalProps]?: 'nextNumber' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ type: 'integer' })
  year!: number

  @Property({ name: 'next_number', type: 'integer', default: 1 })
  nextNumber: number = 1

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// The Phase I queue (assignee, comments, SLA counters, the three decisions)
// is not built yet — this Phase H slice only needs enough of the submission
// to (a) exist as the thing `quote_request.sent` refers to and (b) lock the
// revision it binds to (§3.8, §3.9's "revision becomes immutable").
@Entity({ tableName: 'anter_submissions' })
@Index({ properties: ['projectId'] })
@Index({ properties: ['revisionId'] })
export class AnterSubmission {
  [OptionalProps]?:
    | 'customerEntityId'
    | 'assignedUserId'
    | 'dueAt'
    | 'closedAt'
    | 'resultingOrderId'
    | 'resultingOfferId'
    | 'valueNetAmount'
    | 'currencyCode'
    | 'positionCount'
    | 'createdAt'
    | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'submission_number', type: 'text' })
  submissionNumber!: string

  @Property({ name: 'project_id', type: 'uuid' })
  projectId!: string

  @Property({ name: 'revision_id', type: 'uuid' })
  revisionId!: string

  @Property({ name: 'customer_entity_id', type: 'uuid', nullable: true })
  customerEntityId?: string | null

  // `priced` | `unpriced` (§3.9).
  @Property({ type: 'text' })
  track!: string

  // `technical_review` | `valuation` | `closed_order` | `closed_offer` | `revision_requested` | `rejected`.
  @Property({ type: 'text', default: 'technical_review' })
  state: string = 'technical_review'

  @Property({ name: 'assigned_user_id', type: 'uuid', nullable: true })
  assignedUserId?: string | null

  @Property({ name: 'due_at', type: Date, nullable: true })
  dueAt?: Date | null

  @Property({ name: 'submitted_at', type: Date })
  submittedAt!: Date

  @Property({ name: 'closed_at', type: Date, nullable: true })
  closedAt?: Date | null

  @Property({ name: 'resulting_order_id', type: 'uuid', nullable: true })
  resultingOrderId?: string | null

  @Property({ name: 'resulting_offer_id', type: 'uuid', nullable: true })
  resultingOfferId?: string | null

  @Property({ name: 'value_net_amount', type: 'numeric', precision: 16, scale: 4, nullable: true })
  valueNetAmount?: string | null

  @Property({ name: 'currency_code', type: 'text', nullable: true })
  currencyCode?: string | null

  @Property({ name: 'position_count', type: 'integer', default: 0 })
  positionCount: number = 0

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
