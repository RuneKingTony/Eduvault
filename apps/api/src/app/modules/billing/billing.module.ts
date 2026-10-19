import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { CampusModule } from '../campus/campus.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { BillingPlanService } from './billing-plan.service';
import { BillingController } from './billing.controller';
import { BillingPlanRepository } from './billing-plan.repository';
import { BillingRunRepository } from './billing-run.repository';
import { BillingService } from './billing.service';
import { KyselyBillingPlanRepository } from './kysely-billing-plan.repository';
import { KyselyBillingRunRepository } from './kysely-billing-run.repository';

@Module({
  imports: [
    EduvaultAuthModule,
    CampusModule,
    InvoiceModule,
    LedgerPosterModule,
    ActivityModule,
  ],
  controllers: [BillingController],
  exports: [BillingService, BillingPlanService],
  providers: [
    BillingService,
    BillingPlanService,
    { provide: BillingPlanRepository, useClass: KyselyBillingPlanRepository },
    { provide: BillingRunRepository, useClass: KyselyBillingRunRepository },
  ],
})
export class BillingModule {}
