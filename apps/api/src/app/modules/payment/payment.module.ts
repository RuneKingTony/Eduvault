import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { MoneyAccountModule } from '../money-account/money-account.module';
import { KyselyPaymentRepository } from './kysely-payment.repository';
import { PaymentController } from './payment.controller';
import { PaymentRepository } from './payment.repository';
import { PaymentService } from './payment.service';

@Module({
  imports: [EduvaultAuthModule, LedgerPosterModule, MoneyAccountModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    { provide: PaymentRepository, useClass: KyselyPaymentRepository },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
