import { Module } from '@nestjs/common';
import {
  ApprovalRegistryModule,
  registerApprovals,
} from '../../common/approvals';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { AdjustmentController } from './adjustment.controller';
import { AdjustmentRepository } from './adjustment.repository';
import { AdjustmentService } from './adjustment.service';
import { DiscountRepository } from './discount.repository';
import { DiscountService } from './discount.service';
import { KyselyAdjustmentRepository } from './kysely-adjustment.repository';
import { KyselyDiscountRepository } from './kysely-discount.repository';

@Module({
  imports: [EduvaultAuthModule, LedgerPosterModule, ApprovalRegistryModule],
  controllers: [AdjustmentController],
  providers: [
    AdjustmentService,
    DiscountService,
    { provide: AdjustmentRepository, useClass: KyselyAdjustmentRepository },
    { provide: DiscountRepository, useClass: KyselyDiscountRepository },
    registerApprovals(AdjustmentRepository),
    registerApprovals(DiscountRepository),
  ],
})
export class AdjustmentModule {}
