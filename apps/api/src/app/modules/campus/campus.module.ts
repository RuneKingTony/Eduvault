import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusController } from './campus.controller';
import { CampusRepository } from './campus.repository';
import { CampusService } from './campus.service';
import { KyselyCampusRepository } from './kysely-campus.repository';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [CampusController],
  providers: [
    CampusService,
    { provide: CampusRepository, useClass: KyselyCampusRepository },
  ],
  exports: [CampusService],
})
export class CampusModule {}
