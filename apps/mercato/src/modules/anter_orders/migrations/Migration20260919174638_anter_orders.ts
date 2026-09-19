import { Migration } from '@mikro-orm/migrations';

export class Migration20260919174638_anter_orders extends Migration {

  override name = 'Migration20260919174638';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_orders" ("id" uuid not null default gen_random_uuid(), "customer_entity_id" uuid not null, "cart_id" uuid null, "status" text not null default 'placed', "delivery_mode" text not null, "partner_reference" text null, "notes" text null, "currency_code" text not null, "subtotal_net_amount" numeric(14,2) not null, "shipping_net_amount" numeric(14,2) not null default '0', "grand_total_net_amount" numeric(14,2) not null, "grand_total_gross_amount" numeric(14,2) not null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "anter_orders_customer_entity_id_index" on "anter_orders" ("customer_entity_id");`);

    this.addSql(`create table "anter_order_lines" ("id" uuid not null default gen_random_uuid(), "order_id" uuid not null, "product_id" uuid not null, "variant_id" uuid null, "product_title" text not null, "quantity" int not null, "list_unit_price_net" numeric(14,4) not null, "partner_unit_price_net" numeric(14,4) not null, "discount_rate" numeric(5,4) not null default '0', "line_net_amount" numeric(14,2) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_order_lines_order_id_index" on "anter_order_lines" ("order_id");`);

    this.addSql(`create table "anter_partner_group_discounts" ("id" uuid not null default gen_random_uuid(), "partner_terms_id" uuid not null, "category_id" uuid null, "discount_rate" numeric(5,4) not null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "anter_partner_group_discounts_partner_terms_id_index" on "anter_partner_group_discounts" ("partner_terms_id");`);

    this.addSql(`create table "anter_partner_terms" ("id" uuid not null default gen_random_uuid(), "customer_entity_id" uuid not null, "default_discount_rate" numeric(5,4) not null default '0', "price_list_code" text null, "is_blocked" boolean not null default false, "notes" text null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "anter_partner_terms" add constraint "anter_partner_terms_customer_entity_id_unique" unique ("customer_entity_id");`);

    this.addSql(`create table "anter_stock_items" ("id" uuid not null default gen_random_uuid(), "product_id" uuid not null, "variant_id" uuid null, "on_hand" int not null default 0, "expected_restock_at" timestamptz null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "anter_stock_items" add constraint "anter_stock_items_product_id_variant_id_organization_id_unique" unique ("product_id", "variant_id", "organization_id");`);
  }

}
