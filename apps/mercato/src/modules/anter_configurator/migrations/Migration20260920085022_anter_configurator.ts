import { Migration } from '@mikro-orm/migrations';

export class Migration20260920085022_anter_configurator extends Migration {

  override name = 'Migration20260920085022';

  override up(): void | Promise<void> {
    this.addSql(`create table "anter_submission_comments" ("id" uuid not null default gen_random_uuid(), "submission_id" uuid not null, "element_id" uuid null, "author_user_id" uuid null, "author_customer_user_id" uuid null, "body" text not null, "visibility" text not null default 'shared', "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "anter_submission_comments_submission_id_index" on "anter_submission_comments" ("submission_id");`);

    this.addSql(`create table "anter_submission_events" ("id" uuid not null default gen_random_uuid(), "submission_id" uuid not null, "from_state" text null, "to_state" text not null, "actor_user_id" uuid null, "actor_customer_user_id" uuid null, "reason" text null, "occurred_at" timestamptz not null, "organization_id" uuid not null, "tenant_id" uuid not null, primary key ("id"));`);
    this.addSql(`create index "anter_submission_events_submission_id_index" on "anter_submission_events" ("submission_id");`);
  }

}
