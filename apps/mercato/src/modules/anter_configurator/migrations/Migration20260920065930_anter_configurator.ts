import { Migration } from '@mikro-orm/migrations';

export class Migration20260920065930_anter_configurator extends Migration {

  override name = 'Migration20260920065930';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_bom_lines" ("id" uuid not null default gen_random_uuid(), "revision_id" uuid not null, "product_id" uuid not null, "product_variant_id" uuid null, "sku" text null, "name_snapshot" text not null, "origin" text not null, "source_element_ids" jsonb not null, "quantity" numeric(16,4) not null, "unit_code" text not null, "realised_length_m" numeric(16,4) null, "residual_length_m" numeric(16,4) null, "module_count" int null, "post_count" int null, "anchor_count" int null, "list_unit_price_net" numeric(16,4) null, "partner_unit_price_net" numeric(16,4) null, "discount_rate" numeric(7,4) null, "unit_cost_net" numeric(16,4) null, "price_state" text not null, "net_amount" numeric(16,4) null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_bom_lines_revision_id_index" on "anter_bom_lines" ("revision_id");`);

    this.addSql(`create table "anter_custom_items" ("id" uuid not null default gen_random_uuid(), "revision_id" uuid not null, "description" text not null, "quantity" numeric(16,4) not null, "unit_code" text not null, "assigned_constructor_user_id" uuid null, "valuation_state" text not null default 'awaiting', "unit_price_net" numeric(16,4) null, "priced_by_user_id" uuid null, "priced_at" timestamptz null, "forced_variant_of_product_id" uuid null, "forced_by_user_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "anter_custom_items_revision_id_index" on "anter_custom_items" ("revision_id");`);

    this.addSql(`create table "anter_plan_points" ("id" uuid not null default gen_random_uuid(), "revision_id" uuid not null, "point_kind" text not null, "position" jsonb not null, "state" text not null default 'open', "skip_reason" text null, "covered_by_element_id" uuid null, "coverage_radius_m" numeric(8,4) not null default '1.5', "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_plan_points_revision_id_index" on "anter_plan_points" ("revision_id");`);

    this.addSql(`create table "anter_projects" ("id" uuid not null default gen_random_uuid(), "project_number" text not null, "name" text not null, "customer_entity_id" uuid null, "customer_user_id" uuid null, "customer_deal_id" uuid null, "origin" text not null, "site_address_snapshot" jsonb null, "current_revision_id" uuid null, "status" text not null default 'active', "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "anter_projects_customer_entity_id_index" on "anter_projects" ("customer_entity_id");`);

    this.addSql(`create table "anter_project_elements" ("id" uuid not null default gen_random_uuid(), "revision_id" uuid not null, "element_kind" text not null, "product_id" uuid null, "product_variant_id" uuid null, "sku_snapshot" text null, "name_snapshot" text null, "geometry" jsonb not null, "host_element_id" uuid null, "host_offset_ratio" numeric(9,6) null, "label" text null, "is_outside_price_list" boolean not null default false, "sort_order" int not null default 0, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_project_elements_host_element_id_index" on "anter_project_elements" ("host_element_id");`);
    this.addSql(`create index "anter_project_elements_revision_id_index" on "anter_project_elements" ("revision_id");`);

    this.addSql(`create table "anter_project_revisions" ("id" uuid not null default gen_random_uuid(), "project_id" uuid not null, "revision_label" text not null, "state" text not null default 'draft', "underlay_attachment_id" uuid null, "underlay_width_units" numeric(16,4) null, "underlay_height_units" numeric(16,4) null, "metres_per_unit" numeric(16,8) null, "calibration_points" jsonb null, "grid_size_m" numeric(8,4) not null default '0.5', "change_description" text null, "bom_computed_at" timestamptz null, "bom_total_net_amount" numeric(16,4) null, "bom_currency_code" text null, "has_unpriced_items" boolean not null default false, "technical_acceptance_state" text not null default 'none', "technical_accepted_by_user_id" uuid null, "technical_accepted_at" timestamptz null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "anter_project_revisions_project_id_index" on "anter_project_revisions" ("project_id");`);
    this.addSql(`alter table "anter_project_revisions" add constraint "anter_project_revisions_project_id_revision_label_unique" unique ("project_id", "revision_label");`);

    this.addSql(`create table "anter_project_sequences" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "year" int not null, "next_number" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "anter_project_sequences" add constraint "anter_project_sequences_tenant_id_organization_id_year_unique" unique ("tenant_id", "organization_id", "year");`);
  }

}
