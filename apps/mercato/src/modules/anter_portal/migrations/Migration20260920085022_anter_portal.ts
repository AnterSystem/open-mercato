import { Migration } from '@mikro-orm/migrations';

export class Migration20260920085022_anter_portal extends Migration {

  override name = 'Migration20260920085022';

  override up(): void | Promise<void> {
    this.addSql(`alter table "anter_cart_lines" add "revision_id" uuid null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "anter_cart_lines" drop column "revision_id";`);
  }

}
