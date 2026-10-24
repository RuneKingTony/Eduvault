import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { GatewayModule } from '../gateway/gateway.module';
import { WalletAutoPayModule } from '../../common/wallet';
import { MoneyAccountModule } from '../money-account/money-account.module';
import { KyselyWalletRepository } from './kysely-wallet.repository';
import { WalletReservedAccountService } from './wallet-reserved-account.service';
import { WalletPortalController } from './wallet-portal.controller';
import { WalletPortalService } from './wallet-portal.service';
import { WalletController } from './wallet.controller';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    EduvaultAuthModule,
    LedgerPosterModule,
    ActivityModule,
    WalletAutoPayModule,
    MoneyAccountModule,
    GatewayModule,
  ],
  controllers: [WalletController, WalletPortalController],
  providers: [
    WalletService,
    WalletReservedAccountService,
    WalletPortalService,
    { provide: WalletRepository, useClass: KyselyWalletRepository },
  ],
})
export class WalletModule {}
