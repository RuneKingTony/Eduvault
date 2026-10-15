import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { KyselyMoneyAccountRepository } from './kysely-money-account.repository';
import { MoneyAccountController } from './money-account.controller';
import { MoneyAccountRepository } from './money-account.repository';
import { MoneyAccountService } from './money-account.service';

@Module({
  imports: [EduvaultAuthModule, CampusModule],
  controllers: [MoneyAccountController],
  providers: [
    MoneyAccountService,
    { provide: MoneyAccountRepository, useClass: KyselyMoneyAccountRepository },
  ],
  exports: [MoneyAccountService],
})
export class MoneyAccountModule {}
