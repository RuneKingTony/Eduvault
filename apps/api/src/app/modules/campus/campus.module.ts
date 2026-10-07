import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusController } from './campus.controller';
import { CampusService } from './campus.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [CampusController],
  providers: [CampusService],
  exports: [CampusService],
})
export class CampusModule {}
