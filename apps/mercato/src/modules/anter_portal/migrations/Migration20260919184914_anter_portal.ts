import { Migration } from '@mikro-orm/migrations';

export class Migration20260919184914_anter_portal extends Migration {

  override name = 'Migration20260919184914';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_carts" ("id" uuid not null default gen_random_uuid(), "customer_entity_id" uuid not null, "customer_user_id" uuid not null, "currency_code" text not null, "delivery_mode" text null, "delivery_address_id" uuid null, "delivery_address_snapshot" jsonb null, "partner_reference" text null, "notes" text null, "status" text not null default 'active', "converted_order_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "anter_carts_customer_user_id_index" on "anter_carts" ("customer_user_id");`);
    this.addSql(`create index "anter_carts_customer_entity_id_index" on "anter_carts" ("customer_entity_id");`);

    this.addSql(`create table "anter_cart_lines" ("id" uuid not null default gen_random_uuid(), "cart_id" uuid not null, "product_id" uuid not null, "product_variant_id" uuid null, "sku" text null, "name_snapshot" text null, "variant_snapshot" jsonb null, "quantity" numeric(16,4) not null, "unit_code" text null, "list_unit_price_net" numeric(16,4) null, "partner_unit_price_net" numeric(16,4) null, "discount_rate" numeric(7,4) not null default '0', "currency_code" text not null, "price_resolved_at" timestamptz null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_cart_lines_cart_id_index" on "anter_cart_lines" ("cart_id");`);
  }

}
