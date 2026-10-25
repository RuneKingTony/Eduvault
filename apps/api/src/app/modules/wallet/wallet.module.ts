import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import {
  ApprovalRegistryModule,
  registerApprovals,
} from '../../common/approvals';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { GatewayModule } from '../gateway/gateway.module';
import { WalletAutoPayModule } from '../../common/wallet';
import { MoneyAccountModule } from '../money-account/money-account.module';
import { KyselyWalletRepository } from './kysely-wallet.repository';
import { WalletRefundService } from './wallet-refund.service';
import {
  WalletAskController,
  WalletRefundController,
  WalletRequestController,
  WalletTopUpCancellationController,
} from './wallet-request.controller';
import { WalletRequestService } from './wallet-request.service';
import { WalletReservedAccountService } from './wallet-reserved-account.service';
import { WalletPortalController } from './wallet-portal.controller';
import { WalletPortalService } from './wallet-portal.service';
import { WalletTopUpCancellationService } from './wallet-topup-cancellation.service';
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
    ApprovalRegistryModule,
  ],
  controllers: [
    WalletController,
    WalletAskController,
    WalletPortalController,
    WalletRequestController,
    WalletRefundController,
    WalletTopUpCancellationController,
  ],
  providers: [
    WalletService,
    WalletRefundService,
    WalletTopUpCancellationService,
    WalletRequestService,
    WalletReservedAccountService,
    WalletPortalService,
    { provide: WalletRepository, useClass: KyselyWalletRepository },
    registerApprovals(WalletRepository),
  ],
})
export class WalletModule {}
