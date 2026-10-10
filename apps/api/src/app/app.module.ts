import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ActingAuditMiddleware, AuditModule } from './common/audit';
import { EduvaultAuthModule } from './common/auth';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/db/database.module';
import { CampusModule } from './modules/campus/campus.module';
import { FeeScheduleModule } from './modules/fee-schedule/fee-schedule.module';
import { HealthModule } from './modules/health/health.module';
import { MembersModule } from './modules/members/members.module';
import { MeModule } from './modules/me/me.module';
import { PlatformModule } from './modules/platform/platform.module';
import { SchoolAccountModule } from './modules/school-account/school-account.module';
import { StudentModule } from './modules/student/student.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    EduvaultAuthModule,
    AuditModule,
    HealthModule,
    MeModule,
    MembersModule,
    PlatformModule,
    CampusModule,
    SchoolAccountModule,
    FeeScheduleModule,
    StudentModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ActingAuditMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
