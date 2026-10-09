import { Inject, Injectable } from '@nestjs/common';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { MeRepository } from './me.repository';

@Injectable()
export class KyselyMeRepository extends MeRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async countSchools(userId: string): Promise<number> {
    const row = await this.db
      .selectFrom('member')
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .where('userId', '=', userId)
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }
}
