import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { LedgerService } from './ledger.service';

@Controller('finance')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('ledger-accounts')
  @OrganizationAuth('ledger', 'read')
  list(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof contract.ledgerAccounts.list>> {
    return this.ledger.listAccounts(org);
  }

  @Post('ledger-accounts')
  @OrganizationAuth(['ledger:manageAccounts', 'feeLine:create'])
  create(
    @Org() org: OrgContext,
    @Body(zod(contract.ledgerAccounts.create.body))
    body: Parameters<LedgerService['createAccount']>[1]
  ): Promise<RouteOutput<typeof contract.ledgerAccounts.create>> {
    return this.ledger.createAccount(org, body);
  }

  @Get('journal')
  @OrganizationAuth('ledger', 'read')
  journal(
    @Org() org: OrgContext,
    @Query(zod(contract.journal.list.query))
    query: Parameters<LedgerService['journal']>[1]
  ): Promise<RouteOutput<typeof contract.journal.list>> {
    return this.ledger.journal(org, query);
  }

  @Post('opening-balances')
  @OrganizationAuth('ledger', 'manageAccounts')
  openingBalances(
    @Org() org: OrgContext,
    @Body(zod(contract.openingBalances.post.body))
    body: Parameters<LedgerService['postOpening']>[1]
  ): Promise<RouteOutput<typeof contract.openingBalances.post>> {
    return this.ledger.postOpening(org, body);
  }
}
