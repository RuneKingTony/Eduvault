import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { KyselyLedgerRepository } from './kysely-ledger.repository';
import { LedgerController } from './ledger.controller';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';

@Module({
  imports: [EduvaultAuthModule, LedgerPosterModule, ActivityModule],
  controllers: [LedgerController],
  providers: [
    LedgerService,
    { provide: LedgerRepository, useClass: KyselyLedgerRepository },
  ],
})
export class LedgerModule {}
