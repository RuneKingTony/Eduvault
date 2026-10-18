import { Injectable } from '@nestjs/common';
import {
  feeTermLabel,
  type DashboardCharged,
  type DashboardMoney,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { BillingPlanService } from '../billing/billing-plan.service';
import { InvoiceService } from '../invoice/invoice.service';
import { MoneyAccountService } from '../money-account/money-account.service';

@Injectable()
export class DashboardMoneyService {
  constructor(
    private readonly accounts: MoneyAccountService,
    private readonly plans: BillingPlanService,
    private readonly invoices: InvoiceService
  ) {}

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

  async charged(ctx: OrgContext): Promise<DashboardCharged | null> {
    const term = await this.plans.currentTerm(ctx);
    if (term === undefined) {
      return null;
    }
    const totals = await this.invoices.chargedIn(ctx, term.id);
    return {
      currency: totals.currency,
      termId: term.id,
      termName: feeTermLabel(term),
      chargedMinor: totals.totalMinor,
      chargeCount: totals.count,
    };
  }
}
