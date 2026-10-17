import { Inject, Injectable } from '@nestjs/common';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { schoolCurrency } from '../../common/ledger';
import { ApprovalsRepository } from './approvals.repository';

@Injectable()
export class KyselyApprovalsRepository extends ApprovalsRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }
}
