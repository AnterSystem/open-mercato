import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

@Entity({ tableName: 'anter_partner_terms' })
@Unique({ properties: ['customerEntityId'] })
export class AnterPartnerTerms {
  [OptionalProps]?: 'defaultDiscountRate' | 'priceListCode' | 'isBlocked' | 'notes' | 'createdAt' | 'updatedAt' | 'deletedAt'

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
