import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import {
  ApprovalRegistryModule,
  registerApprovals,
} from '../../common/approvals';
import { EduvaultAuthModule } from '../../common/auth';
import { CalendarModule } from '../calendar/calendar.module';
import { KyselyLeaveRepository } from './kysely-leave.repository';
import { LeaveApprovalProvider } from './leave-approval.provider';
import { LeaveController } from './leave.controller';
import { LeaveRepository } from './leave.repository';
import { LeaveService } from './leave.service';

@Module({
  imports: [
    EduvaultAuthModule,
    ActivityModule,
    ApprovalRegistryModule,
    CalendarModule,
  ],
  controllers: [LeaveController],
  providers: [
    LeaveService,
    LeaveApprovalProvider,
    { provide: LeaveRepository, useClass: KyselyLeaveRepository },
    registerApprovals(LeaveApprovalProvider),
  ],
  exports: [LeaveService],
})
export class LeaveModule {}
