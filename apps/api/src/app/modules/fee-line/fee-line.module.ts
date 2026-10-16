import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { FeeGridService } from './fee-grid.service';
import { FeeLineController } from './fee-line.controller';
import {
  FeeLineRepository,
  FeeOptionRepository,
  FeeStudentRepository,
  FeeTypeRepository,
} from './fee-line.repository';
import { FeeLineService } from './fee-line.service';
import { FeeOptionController } from './fee-option.controller';
import { FeeOptionService } from './fee-option.service';
import { FeePreviewService } from './fee-preview.service';
import { FeeTypeController } from './fee-type.controller';
import { FeeTypeService } from './fee-type.service';
import { KyselyFeeLineRepository } from './kysely-fee-line.repository';
import { KyselyFeeOptionRepository } from './kysely-fee-option.repository';
import { KyselyFeeStudentRepository } from './kysely-fee-student.repository';
import { KyselyFeeTypeRepository } from './kysely-fee-type.repository';

@Module({
  imports: [EduvaultAuthModule, CampusModule],
  controllers: [FeeLineController, FeeTypeController, FeeOptionController],
  providers: [
    FeeLineService,
    FeeGridService,
    FeeTypeService,
    FeeOptionService,
    FeePreviewService,
    { provide: FeeLineRepository, useClass: KyselyFeeLineRepository },
    { provide: FeeTypeRepository, useClass: KyselyFeeTypeRepository },
    { provide: FeeOptionRepository, useClass: KyselyFeeOptionRepository },
    { provide: FeeStudentRepository, useClass: KyselyFeeStudentRepository },
  ],
})
export class FeeLineModule {}
