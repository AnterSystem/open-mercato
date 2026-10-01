export type AnterDemoScope = { tenantId: string; organizationId: string }

export type CatalogCategoryFixture = {
  key: string
  name: string
  slug: string
  parentKey: string | null
}

export type CatalogVariantFixture = {
  name: string
  sku: string
  optionValues: Record<string, string>
  isDefault: boolean
  price: number
  dimensions?: { width?: number; height?: number; depth?: number; unit: string }
  metadata: Record<string, unknown>
}

export type CatalogOptionFixture = {
  code: string
  label: string
  inputType: 'select' | 'text' | 'textarea' | 'number'
  isRequired: boolean
  choices: Array<{ code: string; label: string }>
}

export type CatalogProductFixture = {
  handle: string
  sku: string
  title: string
  subtitle?: string
  description: string
  categoryKey: string
  isConfigurable: boolean
  price: number
  metadata: Record<string, unknown>
  image: { file: string; caption: string | null } | null
  optionSchema: { name: string; options: CatalogOptionFixture[] } | null
  variants: CatalogVariantFixture[]
}

export type CatalogFixture = {
  source: string
  currencyCode: string
  taxRate: number
  categories: CatalogCategoryFixture[]
  products: CatalogProductFixture[]
}

export type CompanyFixture = {
  ref: string
  display_name: string
  description?: string
  primary_email?: string
  primary_phone?: string
  status?: string
  lifecycle_stage?: string
  legal_name?: string
  brand_name?: string
  domain?: string
  website_url?: string
  industry?: string
  size_bucket?: string
  annual_revenue?: number
}

export type PersonFixture = {
  ref: string
  display_name: string
  description?: string
  primary_email?: string
  primary_phone?: string
  status?: string
  lifecycle_stage?: string
  first_name?: string
  last_name?: string
  job_title?: string
  companyRef?: string
}

export type CustomersFixture = {
  companies: CompanyFixture[]
  people: PersonFixture[]
}

export type PortalUserFixture = {
  email: string
  displayName: string
  emailVerified: boolean
  isActive: boolean
  companyRef: string | null
  personRef: string | null
  roles: string[]
}

export type AnterOrderLineFixture = {
  lineNumber: number
  productSku: string
  variantSku: string | null
  sku?: string | null
  nameSnapshot: string
  variantSnapshot?: Record<string, unknown> | null
  quantity: number
  unitCode?: string | null
  listUnitPriceNet: number
  unitPriceNet: number
  discountAmount: number
  taxRate: number
  netAmount: number
  grossAmount: number
  fulfilmentMode: string
  lineStatus: string
  shippedQuantity: number
  expectedAt?: string | null
}

export type AnterOrderFixture = {
  orderNumber: string
  companyRef: string
  customerUserRef: string | null
  notes: string | null
  source: string
  status: string
  currencyCode: string
  deliveryMode: string
  deliveryAddressSnapshot?: Record<string, unknown> | null
  partnerReference: string | null
  paymentTermsDays: number
  subtotalNetAmount: number
  discountTotalAmount: number
  shippingNetAmount: number
  taxTotalAmount: number
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
  placedAt: string | null
  confirmedAt: string | null
  closedAt: string | null
  lines: AnterOrderLineFixture[]
}

export type AnterFixture = {
  orderSequences: Array<{ year: number; nextNumber: number }>
  partnerTerms: Array<{
    companyRef: string
    defaultDiscountRate: number
    priceListCode: string | null
    isBlocked: boolean
    notes?: string | null
  }>
  partnerGroupDiscounts: Array<{
    companyRef: string
    categoryId: string | null
    discountRate: number
  }>
  stockItems: Array<{
    productSku: string
    variantSku: string | null
    onHand: number
    expectedRestockAt: string | null
  }>
  orders: AnterOrderFixture[]
  shipments: Array<{
    orderNumber: string
    shipmentNumber: string
    sequenceNumber: number
    status: string
    carrierName: string | null
    trackingNumber: string | null
    weightKg?: number | null
    packageCount?: number | null
    shippingCostNet: number
    dispatchedAt: string | null
    deliveredAt: string | null
  }>
  invoices: Array<{
    orderNumber: string
    invoiceNumber: string
    issuedAt: string | null
    netAmount: number
    grossAmount: number
    currencyCode: string
  }>
  stockAllocations: Array<{
    orderLineRef: OrderLineRef
    stockRef: StockRef
    quantity: number
    status: string
  }>
  shipmentLines: Array<{
    shipmentNumber: string
    orderLineRef: OrderLineRef
    quantity: number
  }>
  carts: AnterCartFixture[]
  projectSequences: Array<{ year: number; nextNumber: number }>
  projects: AnterProjectFixture[]
}

/** Order lines have no natural key of their own; address them by order + line. */
export type OrderLineRef = { orderNumber: string; lineNumber: number }
export type StockRef = { productSku: string; variantSku: string | null }
export type RevisionRef = { projectNumber: string; revisionLabel: string }

export type AnterCartFixture = {
  ref: string
  companyRef: string | null
  customerUserRef: string | null
  currencyCode: string
  deliveryMode: string | null
  deliveryAddressSnapshot?: Record<string, unknown> | null
  partnerReference: string | null
  notes: string | null
  status: string
  lines: Array<{
    productSku: string
    variantSku: string | null
    revisionRef: RevisionRef | null
    sku: string | null
    nameSnapshot: string | null
    variantSnapshot?: Record<string, unknown> | null
    quantity: number
    unitCode: string | null
    listUnitPriceNet: number | null
    partnerUnitPriceNet: number | null
    discountRate: number
    currencyCode: string
  }>
}

export type AnterProjectFixture = {
  projectNumber: string
  name: string
  companyRef: string | null
  customerUserRef: string | null
  origin: string
  status: string
  siteAddressSnapshot?: Record<string, unknown> | null
  currentRevisionLabel: string | null
  revisions: Array<{
    revisionLabel: string
    state: string
    /** File under `seed/media/`; the underlay is uploaded as an attachment. */
    underlayFile: string | null
    underlayWidthUnits: number | null
    underlayHeightUnits: number | null
    metresPerUnit: number | null
    calibrationPoints?: unknown
    gridSizeM: number | null
    changeDescription: string | null
    bomTotalNetAmount: number | null
    bomCurrencyCode: string | null
    hasUnpricedItems: boolean
    technicalAcceptanceState: string | null
  }>
}

export type GeometryProductFixture = {
  sku: string
  handle: string
  title: string
  description: string
  categoryKey: string
  price: number
}

/**
 * Configurator geometry (spec §3.3) applied to catalogue products by SKU.
 * Every `anter_*` key is optional: a point product has no module length, a
 * line product no insert clear width.
 */
export type GeometryEntryFixture = {
  sku: string
  anter_drawing_kind?: 'line' | 'point' | 'insert' | 'none'
  anter_module_length_m?: number
  anter_module_fit_policy?: 'round_down' | 'round_up' | 'nearest'
  anter_post_sku?: string
  anter_posts_per_run_extra?: number
  anter_anchor_sku?: string
  anter_anchors_per_post?: number
  anter_insert_clear_width_m?: number
  anter_impact_energy_kj?: number
  anter_mounting_conditions?: string
  anter_unit_cost_net?: number
}

export type GeometryFixture = {
  currencyCode: string
  taxRate: number
  products: GeometryProductFixture[]
  geometry: GeometryEntryFixture[]
}
