import { Migration } from '@mikro-orm/migrations';

export class Migration20260920085022_anter_orders extends Migration {

  override name = 'Migration20260920085022';

  override up(): void | Promise<void> {
    this.addSql(`alter table "anter_orders" add "configurator_revision_id" uuid null, add "offer_id" uuid null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "anter_orders" drop column "configurator_revision_id", drop column "offer_id";`);
  }

}
