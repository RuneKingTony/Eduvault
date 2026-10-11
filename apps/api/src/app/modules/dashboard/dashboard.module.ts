import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { StudentModule } from '../student/student.module';
import { ActivityController } from './activity.controller';
import { ActivityRepository } from './activity.repository';
import { ActivityService } from './activity.service';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';
import { KyselyActivityRepository } from './kysely-activity.repository';
import { KyselyDashboardRepository } from './kysely-dashboard.repository';

@Module({
  imports: [EduvaultAuthModule, StudentModule],
  controllers: [DashboardController, ActivityController],
  providers: [
    DashboardService,
    ActivityService,
    { provide: DashboardRepository, useClass: KyselyDashboardRepository },
    { provide: ActivityRepository, useClass: KyselyActivityRepository },
  ],
})
export class DashboardModule {}
