import { Injectable } from '@nestjs/common';
import type { DashboardMoney } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { MoneyAccountService } from '../money-account/money-account.service';

@Injectable()
export class DashboardMoneyService {
  constructor(private readonly accounts: MoneyAccountService) {}

  /** Reads through the money-account list so the visibility rule lives in one place. */
  async summary(ctx: OrgContext): Promise<DashboardMoney> {
    const { currency, items, hiddenSchoolWideCount } =
      await this.accounts.list(ctx);
    const active = items.filter((account) => account.retiredAt === null);
    return {
      currency,
      totalMinor: active.reduce(
        (sum, account) => sum + account.balanceMinor,
        0
      ),
      accounts: active.map((account) => ({
        id: account.id,
        name: account.name,
        kind: account.kind,
        campusName: account.campusName,
        last4: account.last4,
        balanceMinor: account.balanceMinor,
      })),
      hiddenSchoolWide: hiddenSchoolWideCount,
    };
  }
}
