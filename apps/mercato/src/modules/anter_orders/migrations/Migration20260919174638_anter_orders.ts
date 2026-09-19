import { Migration } from '@mikro-orm/migrations';

export class Migration20260919174638_anter_orders extends Migration {

  override name = 'Migration20260919174638';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_partner_terms" ("id" uuid not null default gen_random_uuid(), "customer_entity_id" uuid not null, "default_discount_rate" numeric(5,4) not null default '0', "price_list_code" text null, "is_blocked" boolean not null default false, "notes" text null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "anter_partner_terms" add constraint "anter_partner_terms_customer_entity_id_unique" unique ("customer_entity_id");`);

    this.addSql(`create table "anter_partner_group_discounts" ("id" uuid not null default gen_random_uuid(), "partner_terms_id" uuid not null, "category_id" uuid null, "discount_rate" numeric(5,4) not null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "anter_partner_group_discounts_partner_terms_id_index" on "anter_partner_group_discounts" ("partner_terms_id");`);

    this.addSql(`create table "anter_stock_items" ("id" uuid not null default gen_random_uuid(), "product_id" uuid not null, "variant_id" uuid null, "on_hand" int not null default 0, "expected_restock_at" timestamptz null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "anter_stock_items" add constraint "anter_stock_items_product_id_variant_id_organization_id_unique" unique ("product_id", "variant_id", "organization_id");`);

    this.addSql(`create table "anter_order_sequences" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "year" int not null, "next_number" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "anter_order_sequences" add constraint "anter_order_sequences_tenant_id_organization_id_year_unique" unique ("tenant_id", "organization_id", "year");`);

    this.addSql(`create table "anter_orders" ("id" uuid not null default gen_random_uuid(), "order_number" text not null, "customer_entity_id" uuid not null, "customer_user_id" uuid not null, "source" text not null default 'catalog', "status" text not null default 'placed', "currency_code" text not null, "delivery_mode" text not null, "delivery_address_snapshot" jsonb null, "payment_terms_days" int not null default 0, "subtotal_net_amount" numeric(16,4) not null, "discount_total_amount" numeric(16,4) not null default '0', "shipping_net_amount" numeric(16,4) not null default '0', "tax_total_amount" numeric(16,4) not null default '0', "grand_total_net_amount" numeric(16,4) not null, "grand_total_gross_amount" numeric(16,4) not null, "partner_reference" text null, "notes" text null, "source_cart_id" uuid null, "placed_at" timestamptz null, "confirmed_at" timestamptz null, "closed_at" timestamptz null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "anter_orders_customer_entity_id_index" on "anter_orders" ("customer_entity_id");`);
    this.addSql(`alter table "anter_orders" add constraint "anter_orders_order_number_tenant_id_unique" unique ("order_number", "tenant_id");`);

    this.addSql(`create table "anter_order_lines" ("id" uuid not null default gen_random_uuid(), "order_id" uuid not null, "line_number" int not null, "product_id" uuid not null, "product_variant_id" uuid null, "sku" text null, "name_snapshot" text not null, "variant_snapshot" jsonb null, "quantity" numeric(16,4) not null, "unit_code" text null, "list_unit_price_net" numeric(16,4) not null, "unit_price_net" numeric(16,4) not null, "discount_amount" numeric(16,4) not null default '0', "tax_rate" numeric(7,4) not null default '0', "net_amount" numeric(16,4) not null, "gross_amount" numeric(16,4) not null, "fulfilment_mode" text not null default 'stock', "line_status" text not null default 'awaiting_stock', "shipped_quantity" numeric(16,4) not null default '0', "expected_at" timestamptz null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_order_lines_order_id_index" on "anter_order_lines" ("order_id");`);
  }

}
