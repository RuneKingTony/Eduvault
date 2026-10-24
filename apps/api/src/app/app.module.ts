import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ActingAuditMiddleware, AuditModule } from './common/audit';
import { EduvaultAuthModule } from './common/auth';
import { ClockModule } from './common/clock';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/db/database.module';
import { FilesModule } from './common/files';
import { AdjustmentModule } from './modules/adjustment/adjustment.module';
import { AnnouncementModule } from './modules/announcement/announcement.module';
import { LeaveModule } from './modules/leave/leave.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { PaymentModule } from './modules/payment/payment.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PortalModule } from './modules/portal/portal.module';
import { BillingModule } from './modules/billing/billing.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CampusModule } from './modules/campus/campus.module';
import { ClassModule } from './modules/class/class.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { GuardianModule } from './modules/guardian/guardian.module';
import { FeeLineModule } from './modules/fee-line/fee-line.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { HealthModule } from './modules/health/health.module';
import { MoneyAccountModule } from './modules/money-account/money-account.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { MembersModule } from './modules/members/members.module';
import { MeModule } from './modules/me/me.module';
import { RolesModule } from './modules/roles/roles.module';
import { PlatformModule } from './modules/platform/platform.module';
import { SchoolAccountModule } from './modules/school-account/school-account.module';
import { SchoolModule } from './modules/school/school.module';
import { StoreModule } from './modules/store/store.module';
import { StudentAccountModule } from './modules/student-account/student-account.module';
import { StudentModule } from './modules/student/student.module';
import { SubjectModule } from './modules/subject/subject.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ClockModule,
    EduvaultAuthModule,
    AuditModule,
    FilesModule,
    HealthModule,
    MeModule,
    MembersModule,
    RolesModule,
    PlatformModule,
    CampusModule,
    SchoolAccountModule,
    SchoolModule,
    FeeLineModule,
    StudentModule,
    GuardianModule,
    CalendarModule,
    ClassModule,
    SubjectModule,
    DashboardModule,
    AnnouncementModule,
    PortalModule,
    MoneyAccountModule,
    LedgerModule,
    InvoiceModule,
    BillingModule,
    PaymentModule,
    WalletModule,
    GatewayModule,
    StoreModule,
    AdjustmentModule,
    LeaveModule,
    ApprovalsModule,
    StudentAccountModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ActingAuditMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
