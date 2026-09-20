import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

@Entity({ tableName: 'anter_partner_terms' })
@Unique({ properties: ['customerEntityId'] })
export class AnterPartnerTerms {
  [OptionalProps]?:
    | 'defaultDiscountRate'
    | 'priceListCode'
    | 'isBlocked'
    | 'notes'
    | 'accountType'
    | 'accountOwnerUserId'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'customer_entity_id', type: 'uuid' })
  customerEntityId!: string

  @Property({ name: 'default_discount_rate', type: 'numeric', precision: 5, scale: 4, default: '0' })
  defaultDiscountRate: string = '0'

  @Property({ name: 'price_list_code', type: 'text', nullable: true })
  priceListCode?: string | null

  @Property({ name: 'is_blocked', type: 'boolean', default: false })
  isBlocked: boolean = false

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  // Configurator spec X1: `full` sees prices, `hidden` never does (the
  // partner_unpriced track), `preview` is denied outright. New column
  // defaults to `full` so every existing row behaves exactly as before.
  @Property({ name: 'account_type', type: 'text', default: 'full' })
  accountType: string = 'full'

  // Configurator spec X2: the opiekun named in the `denied`/`quote_request`
  // bodies and used for CRM assignment. Nullable — not every partner has one yet.
  @Property({ name: 'account_owner_user_id', type: 'uuid', nullable: true })
  accountOwnerUserId?: string | null

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

@Entity({ tableName: 'anter_partner_price_list_scope' })
@Index({ properties: ['partnerTermsId'] })
export class AnterPartnerPriceListScope {
  [OptionalProps]?: 'isIncluded' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'partner_terms_id', type: 'uuid' })
  partnerTermsId!: string

  @Property({ name: 'catalog_category_id', type: 'uuid' })
  catalogCategoryId!: string

  // Configurator spec X3: no rows means everything is included — this table
  // only ever needs to carry EXCLUSIONS in practice, but the column stays
  // explicit so a future "included-only" scope doesn't need a schema change.
  @Property({ name: 'is_included', type: 'boolean', default: false })
  isIncluded: boolean = false

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'anter_partner_group_discounts' })
@Index({ properties: ['partnerTermsId'] })
export class AnterPartnerGroupDiscount {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'partner_terms_id', type: 'uuid' })
  partnerTermsId!: string

  @Property({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId?: string | null

  @Property({ name: 'discount_rate', type: 'numeric', precision: 5, scale: 4 })
  discountRate!: string

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

@Entity({ tableName: 'anter_stock_items' })
@Unique({ properties: ['productId', 'variantId', 'organizationId'] })
export class AnterStockItem {
  [OptionalProps]?: 'onHand' | 'expectedRestockAt' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId?: string | null

  @Property({ name: 'on_hand', type: 'integer', default: 0 })
  onHand: number = 0

  @Property({ name: 'expected_restock_at', type: Date, nullable: true })
  expectedRestockAt?: Date | null

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

@Entity({ tableName: 'anter_stock_allocations' })
@Index({ properties: ['stockItemId', 'status'] })
@Index({ properties: ['orderLineId'] })
export class AnterStockAllocation {
  [OptionalProps]?: 'status' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'order_line_id', type: 'uuid' })
  orderLineId!: string

  @Property({ name: 'stock_item_id', type: 'uuid' })
  stockItemId!: string

  @Property({ type: 'numeric', precision: 16, scale: 4 })
  quantity!: string

  @Property({ type: 'text', default: 'allocated' })
  status: string = 'allocated'

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'anter_orders' })
@Index({ properties: ['customerEntityId'] })
@Unique({ properties: ['orderNumber', 'tenantId'] })
export class AnterOrder {
  [OptionalProps]?:
    | 'source'
    | 'status'
    | 'deliveryAddressSnapshot'
    | 'paymentTermsDays'
    | 'discountTotalAmount'
    | 'taxTotalAmount'
    | 'shippingNetAmount'
    | 'partnerReference'
    | 'notes'
    | 'sourceCartId'
    | 'configuratorRevisionId'
    | 'offerId'
    | 'placedAt'
    | 'confirmedAt'
    | 'closedAt'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'order_number', type: 'text' })
  orderNumber!: string

  @Property({ name: 'customer_entity_id', type: 'uuid' })
  customerEntityId!: string

  @Property({ name: 'customer_user_id', type: 'uuid' })
  customerUserId!: string

  @Property({ type: 'text', default: 'catalog' })
  source: string = 'catalog'

  @Property({ type: 'text', default: 'placed' })
  status: string = 'placed'

  @Property({ name: 'currency_code', type: 'text' })
  currencyCode!: string

  @Property({ name: 'delivery_mode', type: 'text' })
  deliveryMode!: string

  @Property({ name: 'delivery_address_snapshot', type: 'jsonb', nullable: true })
  deliveryAddressSnapshot?: Record<string, unknown> | null

  @Property({ name: 'payment_terms_days', type: 'integer', default: 0 })
  paymentTermsDays: number = 0

  @Property({ name: 'subtotal_net_amount', type: 'numeric', precision: 16, scale: 4 })
  subtotalNetAmount!: string

  @Property({ name: 'discount_total_amount', type: 'numeric', precision: 16, scale: 4, default: '0' })
  discountTotalAmount: string = '0'

  @Property({ name: 'shipping_net_amount', type: 'numeric', precision: 16, scale: 4, default: '0' })
  shippingNetAmount: string = '0'

  @Property({ name: 'tax_total_amount', type: 'numeric', precision: 16, scale: 4, default: '0' })
  taxTotalAmount: string = '0'

  @Property({ name: 'grand_total_net_amount', type: 'numeric', precision: 16, scale: 4 })
  grandTotalNetAmount!: string

  @Property({ name: 'grand_total_gross_amount', type: 'numeric', precision: 16, scale: 4 })
  grandTotalGrossAmount!: string

  @Property({ name: 'partner_reference', type: 'text', nullable: true })
  partnerReference?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'source_cart_id', type: 'uuid', nullable: true })
  sourceCartId?: string | null

  // Configurator spec X7: set when `source` is `configurator` — the revision
  // whose technical acceptance the confirm mutation guard checks (X10). Never
  // an ORM relation: `anter_orders` has no compile-time dependency on
  // `anter_configurator` (§3.2's "nothing points back").
  @Property({ name: 'configurator_revision_id', type: 'uuid', nullable: true })
  configuratorRevisionId?: string | null

  // Configurator spec X7: set once an `anter_configurator` offer converts
  // into this order (Phase J). FK-id only, same reasoning as above.
  @Property({ name: 'offer_id', type: 'uuid', nullable: true })
  offerId?: string | null

  @Property({ name: 'placed_at', type: Date, nullable: true })
  placedAt?: Date | null

  @Property({ name: 'confirmed_at', type: Date, nullable: true })
  confirmedAt?: Date | null

  @Property({ name: 'closed_at', type: Date, nullable: true })
  closedAt?: Date | null

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

@Entity({ tableName: 'anter_order_lines' })
@Index({ properties: ['orderId'] })
export class AnterOrderLine {
  [OptionalProps]?:
    | 'productVariantId'
    | 'sku'
    | 'nameSnapshot'
    | 'variantSnapshot'
    | 'unitCode'
    | 'discountAmount'
    | 'taxRate'
    | 'fulfilmentMode'
    | 'lineStatus'
    | 'shippedQuantity'
    | 'expectedAt'
    | 'createdAt'
    | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'line_number', type: 'integer' })
  lineNumber!: number

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'product_variant_id', type: 'uuid', nullable: true })
  productVariantId?: string | null

  @Property({ type: 'text', nullable: true })
  sku?: string | null

  @Property({ name: 'name_snapshot', type: 'text' })
  nameSnapshot!: string

  @Property({ name: 'variant_snapshot', type: 'jsonb', nullable: true })
  variantSnapshot?: Record<string, unknown> | null

  @Property({ type: 'numeric', precision: 16, scale: 4 })
  quantity!: string

  @Property({ name: 'unit_code', type: 'text', nullable: true })
  unitCode?: string | null

  @Property({ name: 'list_unit_price_net', type: 'numeric', precision: 16, scale: 4 })
  listUnitPriceNet!: string

  @Property({ name: 'unit_price_net', type: 'numeric', precision: 16, scale: 4 })
  unitPriceNet!: string

  @Property({ name: 'discount_amount', type: 'numeric', precision: 16, scale: 4, default: '0' })
  discountAmount: string = '0'

  @Property({ name: 'tax_rate', type: 'numeric', precision: 7, scale: 4, default: '0' })
  taxRate: string = '0'

  @Property({ name: 'net_amount', type: 'numeric', precision: 16, scale: 4 })
  netAmount!: string

  @Property({ name: 'gross_amount', type: 'numeric', precision: 16, scale: 4 })
  grossAmount!: string

  @Property({ name: 'fulfilment_mode', type: 'text', default: 'stock' })
  fulfilmentMode: string = 'stock'

  @Property({ name: 'line_status', type: 'text', default: 'awaiting_stock' })
  lineStatus: string = 'awaiting_stock'

  @Property({ name: 'shipped_quantity', type: 'numeric', precision: 16, scale: 4, default: '0' })
  shippedQuantity: string = '0'

  @Property({ name: 'expected_at', type: Date, nullable: true })
  expectedAt?: Date | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'anter_order_sequences' })
@Unique({ properties: ['tenantId', 'organizationId', 'year'] })
export class AnterOrderSequence {
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

@Entity({ tableName: 'anter_shipments' })
@Index({ properties: ['orderId', 'sequenceNumber'] })
export class AnterShipment {
  [OptionalProps]?:
    | 'status'
    | 'carrierName'
    | 'trackingNumber'
    | 'weightKg'
    | 'packageCount'
    | 'shippingCostNet'
    | 'waybillAttachmentId'
    | 'dispatchedAt'
    | 'deliveredAt'
    | 'createdAt'
    | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'shipment_number', type: 'text' })
  shipmentNumber!: string

  @Property({ name: 'sequence_number', type: 'integer' })
  sequenceNumber!: number

  @Property({ type: 'text', default: 'planned' })
  status: string = 'planned'

  @Property({ name: 'carrier_name', type: 'text', nullable: true })
  carrierName?: string | null

  @Property({ name: 'tracking_number', type: 'text', nullable: true })
  trackingNumber?: string | null

  @Property({ name: 'weight_kg', type: 'numeric', precision: 10, scale: 3, nullable: true })
  weightKg?: string | null

  @Property({ name: 'package_count', type: 'integer', nullable: true })
  packageCount?: number | null

  @Property({ name: 'shipping_cost_net', type: 'numeric', precision: 16, scale: 4, default: '0' })
  shippingCostNet: string = '0'

  @Property({ name: 'waybill_attachment_id', type: 'uuid', nullable: true })
  waybillAttachmentId?: string | null

  @Property({ name: 'dispatched_at', type: Date, nullable: true })
  dispatchedAt?: Date | null

  @Property({ name: 'delivered_at', type: Date, nullable: true })
  deliveredAt?: Date | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'anter_invoices' })
@Index({ properties: ['orderId'] })
export class AnterInvoice {
  [OptionalProps]?: 'attachmentId' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'invoice_number', type: 'text' })
  invoiceNumber!: string

  @Property({ name: 'issued_at', type: Date })
  issuedAt!: Date

  @Property({ name: 'net_amount', type: 'numeric', precision: 16, scale: 4 })
  netAmount!: string

  @Property({ name: 'gross_amount', type: 'numeric', precision: 16, scale: 4 })
  grossAmount!: string

  @Property({ name: 'currency_code', type: 'text' })
  currencyCode!: string

  @Property({ name: 'attachment_id', type: 'uuid', nullable: true })
  attachmentId?: string | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'anter_shipment_lines' })
@Index({ properties: ['shipmentId'] })
@Index({ properties: ['orderLineId'] })
export class AnterShipmentLine {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'shipment_id', type: 'uuid' })
  shipmentId!: string

  @Property({ name: 'order_line_id', type: 'uuid' })
  orderLineId!: string

  @Property({ type: 'numeric', precision: 16, scale: 4 })
  quantity!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
