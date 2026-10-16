import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { BillingModule } from '../billing/billing.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { MoneyAccountModule } from '../money-account/money-account.module';
import { StudentModule } from '../student/student.module';
import { ActivityController } from './activity.controller';
import { ActivityRepository } from './activity.repository';
import { ActivityService } from './activity.service';
import { DashboardChargesService } from './dashboard-charges.service';
import { DashboardMoneyService } from './dashboard-money.service';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';
import { DashboardTasksService } from './dashboard-tasks.service';
import { KyselyActivityRepository } from './kysely-activity.repository';
import { KyselyDashboardRepository } from './kysely-dashboard.repository';

@Module({
  imports: [
    EduvaultAuthModule,
    StudentModule,
    MoneyAccountModule,
    BillingModule,
    InvoiceModule,
  ],
  controllers: [DashboardController, ActivityController],
  providers: [
    DashboardService,
    DashboardMoneyService,
    DashboardChargesService,
    DashboardTasksService,
    ActivityService,
    { provide: DashboardRepository, useClass: KyselyDashboardRepository },
    { provide: ActivityRepository, useClass: KyselyActivityRepository },
  ],
})
export class DashboardModule {}
