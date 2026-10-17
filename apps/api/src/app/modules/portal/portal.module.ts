import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { AnnouncementModule } from '../announcement/announcement.module';
import { StudentAccountModule } from '../student-account/student-account.module';
import { StoreModule } from '../store/store.module';
import { KyselyPortalRepository } from './kysely-portal.repository';
import { PortalController } from './portal.controller';
import { PortalStoreService } from './portal-store.service';
import { PortalRepository } from './portal.repository';
import { PortalService } from './portal.service';

@Module({
  imports: [
    EduvaultAuthModule,
    AnnouncementModule,
    StudentAccountModule,
    StoreModule,
  ],
  controllers: [PortalController],
  providers: [
    PortalService,
    PortalStoreService,
    { provide: PortalRepository, useClass: KyselyPortalRepository },
  ],
})
export class PortalModule {}
