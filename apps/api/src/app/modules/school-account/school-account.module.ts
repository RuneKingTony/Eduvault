import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { FilesModule } from '../../common/files';
import { KyselySchoolAccountRepository } from './kysely-school-account.repository';
import { KyselySchoolSettingsRepository } from './kysely-school-settings.repository';
import { SchoolAccountController } from './school-account.controller';
import { SchoolAccountRepository } from './school-account.repository';
import { SchoolAccountService } from './school-account.service';
import { SchoolSettingsController } from './school-settings.controller';
import { SchoolSettingsRepository } from './school-settings.repository';
import { SchoolSettingsService } from './school-settings.service';

@Module({
  imports: [EduvaultAuthModule, FilesModule],
  controllers: [SchoolAccountController, SchoolSettingsController],
  providers: [
    SchoolAccountService,
    SchoolSettingsService,
    {
      provide: SchoolAccountRepository,
      useClass: KyselySchoolAccountRepository,
    },
    {
      provide: SchoolSettingsRepository,
      useClass: KyselySchoolSettingsRepository,
    },
  ],
})
export class SchoolAccountModule {}
