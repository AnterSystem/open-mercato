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

@Entity({ tableName: 'anter_orders' })
@Index({ properties: ['customerEntityId'] })
export class AnterOrder {
  [OptionalProps]?:
    | 'status'
    | 'partnerReference'
    | 'notes'
    | 'shippingNetAmount'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'customer_entity_id', type: 'uuid' })
  customerEntityId!: string

  @Property({ name: 'cart_id', type: 'uuid', nullable: true })
  cartId?: string | null

  @Property({ type: 'text', default: 'placed' })
  status: string = 'placed'

  @Property({ name: 'delivery_mode', type: 'text' })
  deliveryMode!: string

  @Property({ name: 'partner_reference', type: 'text', nullable: true })
  partnerReference?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'currency_code', type: 'text' })
  currencyCode!: string

  @Property({ name: 'subtotal_net_amount', type: 'numeric', precision: 14, scale: 2 })
  subtotalNetAmount!: string

  @Property({ name: 'shipping_net_amount', type: 'numeric', precision: 14, scale: 2, default: '0' })
  shippingNetAmount: string = '0'

  @Property({ name: 'grand_total_net_amount', type: 'numeric', precision: 14, scale: 2 })
  grandTotalNetAmount!: string

  @Property({ name: 'grand_total_gross_amount', type: 'numeric', precision: 14, scale: 2 })
  grandTotalGrossAmount!: string

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
  [OptionalProps]?: 'variantId' | 'discountRate' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId?: string | null

  @Property({ name: 'product_title', type: 'text' })
  productTitle!: string

  @Property({ type: 'integer' })
  quantity!: number

  @Property({ name: 'list_unit_price_net', type: 'numeric', precision: 14, scale: 4 })
  listUnitPriceNet!: string

  @Property({ name: 'partner_unit_price_net', type: 'numeric', precision: 14, scale: 4 })
  partnerUnitPriceNet!: string

  @Property({ name: 'discount_rate', type: 'numeric', precision: 5, scale: 4, default: '0' })
  discountRate: string = '0'

  @Property({ name: 'line_net_amount', type: 'numeric', precision: 14, scale: 2 })
  lineNetAmount!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
