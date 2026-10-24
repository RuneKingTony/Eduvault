import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { FilesModule } from '../../common/files';
import { GatewayModule } from '../gateway/gateway.module';
import { GuardianController } from './guardian.controller';
import { GuardianRepository } from './guardian.repository';
import { GuardianService } from './guardian.service';
import { KyselyGuardianRepository } from './kysely-guardian.repository';
import { LinkWithAccountService } from './link-with-account.service';
import { StudentGuardiansController } from './student-guardians.controller';

@Module({
  imports: [EduvaultAuthModule, FilesModule, ActivityModule, GatewayModule],
  controllers: [GuardianController, StudentGuardiansController],
  providers: [
    GuardianService,
    LinkWithAccountService,
    { provide: GuardianRepository, useClass: KyselyGuardianRepository },
  ],
  exports: [GuardianService],
})
export class GuardianModule {}
