import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { FeeScheduleController } from './fee-schedule.controller';
import { FeeScheduleService } from './fee-schedule.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [FeeScheduleController],
  providers: [FeeScheduleService],
})
export class FeeScheduleModule {}
