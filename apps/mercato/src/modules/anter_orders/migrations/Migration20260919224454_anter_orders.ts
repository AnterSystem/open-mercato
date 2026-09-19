import { Migration } from '@mikro-orm/migrations';

export class Migration20260919224454_anter_orders extends Migration {

  override name = 'Migration20260919224454';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_stock_allocations" ("id" uuid not null default gen_random_uuid(), "order_line_id" uuid not null, "stock_item_id" uuid not null, "quantity" numeric(16,4) not null, "status" text not null default 'allocated', "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_stock_allocations_order_line_id_index" on "anter_stock_allocations" ("order_line_id");`);
    this.addSql(`create index "anter_stock_allocations_stock_item_id_status_index" on "anter_stock_allocations" ("stock_item_id", "status");`);
  }

}
