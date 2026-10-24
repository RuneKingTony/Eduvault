import { Injectable } from '@nestjs/common';
import { ActivityWriter } from '../activity';
import { LedgerPoster } from '../ledger';
import { WalletAutoPayService } from './wallet-auto-pay.service';

@Injectable()
export class WalletWriters {
  constructor(
    readonly poster: LedgerPoster,
    readonly activity: ActivityWriter,
    readonly autoPay: WalletAutoPayService
  ) {}
}
