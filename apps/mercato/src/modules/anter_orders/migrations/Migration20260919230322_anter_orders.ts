import { Migration } from '@mikro-orm/migrations';

export class Migration20260919230322_anter_orders extends Migration {

  override name = 'Migration20260919230322';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_shipments" ("id" uuid not null default gen_random_uuid(), "order_id" uuid not null, "shipment_number" text not null, "sequence_number" int not null, "status" text not null default 'planned', "carrier_name" text null, "tracking_number" text null, "weight_kg" numeric(10,3) null, "package_count" int null, "shipping_cost_net" numeric(16,4) not null default '0', "waybill_attachment_id" uuid null, "dispatched_at" timestamptz null, "delivered_at" timestamptz null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_shipments_order_id_sequence_number_index" on "anter_shipments" ("order_id", "sequence_number");`);

    this.addSql(`create table "anter_shipment_lines" ("id" uuid not null default gen_random_uuid(), "shipment_id" uuid not null, "order_line_id" uuid not null, "quantity" numeric(16,4) not null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_shipment_lines_order_line_id_index" on "anter_shipment_lines" ("order_line_id");`);
    this.addSql(`create index "anter_shipment_lines_shipment_id_index" on "anter_shipment_lines" ("shipment_id");`);
  }

}
