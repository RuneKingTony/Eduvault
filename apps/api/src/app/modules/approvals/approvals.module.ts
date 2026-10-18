import { Module } from '@nestjs/common';
import { ApprovalRegistryModule } from '../../common/approvals';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsRepository } from './approvals.repository';
import { ApprovalsService } from './approvals.service';
import { KyselyApprovalsRepository } from './kysely-approvals.repository';

@Module({
  imports: [EduvaultAuthModule, ApprovalRegistryModule, CampusModule],
  controllers: [ApprovalsController],
  providers: [
    ApprovalsService,
    { provide: ApprovalsRepository, useClass: KyselyApprovalsRepository },
  ],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
