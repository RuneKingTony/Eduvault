import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from './common/auth';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/db/database.module';
import { CampusModule } from './modules/campus/campus.module';
import { FeeScheduleModule } from './modules/fee-schedule/fee-schedule.module';
import { HealthModule } from './modules/health/health.module';
import { MeModule } from './modules/me/me.module';
import { PlatformModule } from './modules/platform/platform.module';
import { SchoolAccountModule } from './modules/school-account/school-account.module';
import { StudentModule } from './modules/student/student.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    EduvaultAuthModule,
    HealthModule,
    MeModule,
    PlatformModule,
    CampusModule,
    SchoolAccountModule,
    FeeScheduleModule,
    StudentModule,
  ],
})
export class AppModule {}
