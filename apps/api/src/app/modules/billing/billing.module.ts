import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { CampusModule } from '../campus/campus.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { BillingPlanService } from './billing-plan.service';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { KyselyBillingRepository } from './kysely-billing.repository';

@Module({
  imports: [
    EduvaultAuthModule,
    CampusModule,
    InvoiceModule,
    LedgerPosterModule,
  ],
  controllers: [BillingController],
  exports: [BillingService, BillingPlanService],
  providers: [
    BillingService,
    BillingPlanService,
    { provide: BillingRepository, useClass: KyselyBillingRepository },
  ],
})
export class BillingModule {}
