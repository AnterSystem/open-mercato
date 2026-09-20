import { Migration } from '@mikro-orm/migrations';

export class Migration20260920081522_anter_orders extends Migration {

  override name = 'Migration20260920081522';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_partner_price_list_scope" ("id" uuid not null default gen_random_uuid(), "partner_terms_id" uuid not null, "catalog_category_id" uuid not null, "is_included" boolean not null default false, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_partner_price_list_scope_partner_terms_id_index" on "anter_partner_price_list_scope" ("partner_terms_id");`);

    this.addSql(`alter table "anter_partner_terms" add "account_type" text not null default 'full', add "account_owner_user_id" uuid null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "anter_partner_terms" drop column "account_type", drop column "account_owner_user_id";`);
  }

}
