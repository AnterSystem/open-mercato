import { Migration } from '@mikro-orm/migrations';

export class Migration20260920081522_anter_configurator extends Migration {

  override name = 'Migration20260920081522';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_submissions" ("id" uuid not null default gen_random_uuid(), "submission_number" text not null, "project_id" uuid not null, "revision_id" uuid not null, "customer_entity_id" uuid null, "track" text not null, "state" text not null default 'technical_review', "assigned_user_id" uuid null, "due_at" timestamptz null, "submitted_at" timestamptz not null, "closed_at" timestamptz null, "resulting_order_id" uuid null, "resulting_offer_id" uuid null, "value_net_amount" numeric(16,4) null, "currency_code" text null, "position_count" int not null default 0, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_submissions_revision_id_index" on "anter_submissions" ("revision_id");`);
    this.addSql(`create index "anter_submissions_project_id_index" on "anter_submissions" ("project_id");`);

    this.addSql(`create table "anter_submission_sequences" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "year" int not null, "next_number" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "anter_submission_sequences" add constraint "anter_submission_sequences_tenant_id_organization_b9f2a_unique" unique ("tenant_id", "organization_id", "year");`);
  }

}
