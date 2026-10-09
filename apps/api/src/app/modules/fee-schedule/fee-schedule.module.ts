import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { FeeScheduleController } from './fee-schedule.controller';
import { FeeScheduleRepository } from './fee-schedule.repository';
import { FeeScheduleService } from './fee-schedule.service';
import { KyselyFeeScheduleRepository } from './kysely-fee-schedule.repository';

@Module({
  imports: [EduvaultAuthModule, CampusModule],
  controllers: [FeeScheduleController],
  providers: [
    FeeScheduleService,
    { provide: FeeScheduleRepository, useClass: KyselyFeeScheduleRepository },
  ],
})
export class FeeScheduleModule {}
