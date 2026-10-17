import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { BillingModule } from '../billing/billing.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { MoneyAccountModule } from '../money-account/money-account.module';
import { StoreModule } from '../store/store.module';
import { StudentAccountModule } from '../student-account/student-account.module';
import { StudentModule } from '../student/student.module';
import { ActivityController } from './activity.controller';
import { ActivityRepository } from './activity.repository';
import { ActivityService } from './activity.service';
import { DashboardChargesService } from './dashboard-charges.service';
import { DashboardFinanceController } from './dashboard-finance.controller';
import { DashboardRollService } from './dashboard-roll.service';
import { DashboardStoreController } from './dashboard-store.controller';
import { DashboardStoreTasksService } from './dashboard-store-tasks.service';
import { DashboardMoneyService } from './dashboard-money.service';
import {
  DASHBOARD_TASK_SOURCES,
  type DashboardTaskSource,
} from './dashboard-task-source';
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
    StudentAccountModule,
    StoreModule,
  ],
  controllers: [
    DashboardController,
    DashboardFinanceController,
    DashboardStoreController,
    ActivityController,
  ],
  providers: [
    DashboardService,
    DashboardMoneyService,
    DashboardChargesService,
    DashboardRollService,
    DashboardTasksService,
    DashboardStoreTasksService,
    {
      provide: DASHBOARD_TASK_SOURCES,
      useFactory: (...sources: DashboardTaskSource[]) => sources,
      inject: [
        DashboardService,
        DashboardChargesService,
        DashboardStoreTasksService,
      ],
    },
    ActivityService,
    { provide: DashboardRepository, useClass: KyselyDashboardRepository },
    { provide: ActivityRepository, useClass: KyselyActivityRepository },
  ],
})
export class DashboardModule {}
