import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { FilesModule } from '../../common/files';
import { GuardianController } from './guardian.controller';
import { GuardianRepository } from './guardian.repository';
import { GuardianService } from './guardian.service';
import { KyselyGuardianRepository } from './kysely-guardian.repository';
import { StudentGuardiansController } from './student-guardians.controller';

@Module({
  imports: [EduvaultAuthModule, FilesModule, ActivityModule],
  controllers: [GuardianController, StudentGuardiansController],
  providers: [
    GuardianService,
    { provide: GuardianRepository, useClass: KyselyGuardianRepository },
  ],
  exports: [GuardianService],
})
export class GuardianModule {}
