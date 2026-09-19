import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

@Entity({ tableName: 'anter_carts' })
@Index({ properties: ['customerEntityId'] })
@Index({ properties: ['customerUserId'] })
export class AnterCart {
  [OptionalProps]?: 'status' | 'deliveryMode' | 'deliveryAddressId' | 'deliveryAddressSnapshot' | 'notes' | 'partnerReference' | 'convertedOrderId' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'customer_entity_id', type: 'uuid' })
  customerEntityId!: string

  @Property({ name: 'customer_user_id', type: 'uuid' })
  customerUserId!: string

  @Property({ name: 'currency_code', type: 'text' })
  currencyCode!: string

  @Property({ name: 'delivery_mode', type: 'text', nullable: true })
  deliveryMode?: string | null

  @Property({ name: 'delivery_address_id', type: 'uuid', nullable: true })
  deliveryAddressId?: string | null

  @Property({ name: 'delivery_address_snapshot', type: 'jsonb', nullable: true })
  deliveryAddressSnapshot?: Record<string, unknown> | null

  @Property({ name: 'partner_reference', type: 'text', nullable: true })
  partnerReference?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ type: 'text', default: 'active' })
  status: string = 'active'

  @Property({ name: 'converted_order_id', type: 'uuid', nullable: true })
  convertedOrderId?: string | null

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

@Entity({ tableName: 'anter_cart_lines' })
@Index({ properties: ['cartId'] })
export class AnterCartLine {
  [OptionalProps]?: 'productVariantId' | 'sku' | 'nameSnapshot' | 'variantSnapshot' | 'unitCode' | 'listUnitPriceNet' | 'partnerUnitPriceNet' | 'discountRate' | 'priceResolvedAt' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'cart_id', type: 'uuid' })
  cartId!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'product_variant_id', type: 'uuid', nullable: true })
  productVariantId?: string | null

  @Property({ type: 'text', nullable: true })
  sku?: string | null

  @Property({ name: 'name_snapshot', type: 'text', nullable: true })
  nameSnapshot?: string | null

  @Property({ name: 'variant_snapshot', type: 'jsonb', nullable: true })
  variantSnapshot?: Record<string, unknown> | null

  @Property({ type: 'numeric', precision: 16, scale: 4 })
  quantity!: string

  @Property({ name: 'unit_code', type: 'text', nullable: true })
  unitCode?: string | null

  @Property({ name: 'list_unit_price_net', type: 'numeric', precision: 16, scale: 4, nullable: true })
  listUnitPriceNet?: string | null

  @Property({ name: 'partner_unit_price_net', type: 'numeric', precision: 16, scale: 4, nullable: true })
  partnerUnitPriceNet?: string | null

  @Property({ name: 'discount_rate', type: 'numeric', precision: 7, scale: 4, default: '0' })
  discountRate: string = '0'

  @Property({ name: 'currency_code', type: 'text' })
  currencyCode!: string

  @Property({ name: 'price_resolved_at', type: Date, nullable: true })
  priceResolvedAt?: Date | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
