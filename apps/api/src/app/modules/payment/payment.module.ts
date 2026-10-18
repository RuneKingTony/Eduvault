import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import {
  ApprovalRegistryModule,
  registerApprovals,
} from '../../common/approvals';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { MoneyAccountModule } from '../money-account/money-account.module';
import { KyselyPaymentVoidRepository } from './kysely-payment-void.repository';
import { KyselyPaymentRepository } from './kysely-payment.repository';
import { PaymentVoidController } from './payment-void.controller';
import { PaymentVoidRepository } from './payment-void.repository';
import { PaymentVoidService } from './payment-void.service';
import { PaymentController } from './payment.controller';
import { PaymentRepository } from './payment.repository';
import { PaymentService } from './payment.service';

@Module({
  imports: [
    EduvaultAuthModule,
    LedgerPosterModule,
    MoneyAccountModule,
    ApprovalRegistryModule,
    ActivityModule,
  ],
  controllers: [PaymentController, PaymentVoidController],
  providers: [
    PaymentService,
    PaymentVoidService,
    { provide: PaymentRepository, useClass: KyselyPaymentRepository },
    { provide: PaymentVoidRepository, useClass: KyselyPaymentVoidRepository },
    registerApprovals(PaymentVoidRepository),
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
