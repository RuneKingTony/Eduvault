import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity';
import { LedgerPosterModule } from '../ledger';
import { WalletAutoPayService } from './wallet-auto-pay.service';
import { WalletWriters } from './wallet-writers';

@Module({
  imports: [LedgerPosterModule, ActivityModule],
  providers: [WalletAutoPayService, WalletWriters],
  exports: [WalletAutoPayService, WalletWriters],
})
export class WalletAutoPayModule {}
