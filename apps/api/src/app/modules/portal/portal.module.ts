import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { AnnouncementModule } from '../announcement/announcement.module';
import { KyselyPortalRepository } from './kysely-portal.repository';
import { PortalController } from './portal.controller';
import { PortalRepository } from './portal.repository';
import { PortalService } from './portal.service';

@Module({
  imports: [EduvaultAuthModule, AnnouncementModule],
  controllers: [PortalController],
  providers: [
    PortalService,
    { provide: PortalRepository, useClass: KyselyPortalRepository },
  ],
})
export class PortalModule {}
