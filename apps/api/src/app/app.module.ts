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
import { FilesModule } from './common/files';
import { CampusModule } from './modules/campus/campus.module';
import { FeeScheduleModule } from './modules/fee-schedule/fee-schedule.module';
import { HealthModule } from './modules/health/health.module';
import { MembersModule } from './modules/members/members.module';
import { MeModule } from './modules/me/me.module';
import { RolesModule } from './modules/roles/roles.module';
import { PlatformModule } from './modules/platform/platform.module';
import { SchoolAccountModule } from './modules/school-account/school-account.module';
import { SchoolModule } from './modules/school/school.module';
import { StudentModule } from './modules/student/student.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
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
