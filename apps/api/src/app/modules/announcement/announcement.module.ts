import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { AnnouncementRepository } from './announcement.repository';
import { AnnouncementService } from './announcement.service';
import { AnnouncementsController } from './announcements.controller';
import { KyselyAnnouncementRepository } from './kysely-announcement.repository';

@Module({
  imports: [EduvaultAuthModule, CampusModule, ActivityModule],
  controllers: [AnnouncementsController],
  providers: [
    AnnouncementService,
    { provide: AnnouncementRepository, useClass: KyselyAnnouncementRepository },
  ],
  exports: [AnnouncementService],
})
export class AnnouncementModule {}
