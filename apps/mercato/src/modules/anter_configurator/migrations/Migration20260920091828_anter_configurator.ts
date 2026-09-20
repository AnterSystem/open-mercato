import { Migration } from '@mikro-orm/migrations';

export class Migration20260920091828_anter_configurator extends Migration {

  override name = 'Migration20260920091828';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_offers" ("id" uuid not null default gen_random_uuid(), "offer_number" text null, "submission_id" uuid null, "project_id" uuid not null, "revision_id" uuid not null, "customer_entity_id" uuid null, "customer_deal_id" uuid null, "status" text not null default 'draft', "currency_code" text not null, "valid_until" date not null, "is_incomplete" boolean not null default false, "incomplete_reason" text null, "subtotal_net_amount" numeric(16,4) not null, "discount_total_amount" numeric(16,4) not null default '0', "shipping_net_amount" numeric(16,4) not null default '0', "tax_total_amount" numeric(16,4) not null default '0', "grand_total_net_amount" numeric(16,4) not null, "grand_total_gross_amount" numeric(16,4) not null, "delivery_terms" text null, "payment_terms_text" text null, "lead_time_text" text null, "document_attachment_id" uuid null, "issued_at" timestamptz null, "accepted_at" timestamptz null, "superseded_by_offer_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "anter_offers_revision_id_index" on "anter_offers" ("revision_id");`);
    this.addSql(`create index "anter_offers_project_id_index" on "anter_offers" ("project_id");`);

    this.addSql(`create table "anter_offer_lines" ("id" uuid not null default gen_random_uuid(), "offer_id" uuid not null, "line_number" int not null, "bom_line_id" uuid null, "custom_item_id" uuid null, "product_id" uuid null, "product_variant_id" uuid null, "sku" text null, "name_snapshot" text not null, "quantity" numeric(16,4) not null, "unit_code" text not null, "list_unit_price_net" numeric(16,4) null, "unit_price_net" numeric(16,4) null, "discount_amount" numeric(16,4) not null default '0', "tax_rate" numeric(7,4) not null default '0', "net_amount" numeric(16,4) null, "gross_amount" numeric(16,4) null, "is_awaiting_valuation" boolean not null default false, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_offer_lines_offer_id_index" on "anter_offer_lines" ("offer_id");`);

    this.addSql(`create table "anter_offer_sequences" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "year" int not null, "next_number" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "anter_offer_sequences" add constraint "anter_offer_sequences_tenant_id_organization_id_year_unique" unique ("tenant_id", "organization_id", "year");`);
  }

}
