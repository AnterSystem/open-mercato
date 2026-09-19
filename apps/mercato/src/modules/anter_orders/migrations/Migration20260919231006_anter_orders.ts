import { Migration } from '@mikro-orm/migrations';

export class Migration20260919231006_anter_orders extends Migration {

  override name = 'Migration20260919231006';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_invoices" ("id" uuid not null default gen_random_uuid(), "order_id" uuid not null, "invoice_number" text not null, "issued_at" timestamptz not null, "net_amount" numeric(16,4) not null, "gross_amount" numeric(16,4) not null, "currency_code" text not null, "attachment_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_invoices_order_id_index" on "anter_invoices" ("order_id");`);
  }

}
