import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit';
import { EduvaultAuthModule } from '../../common/auth';
import { KyselyPlatformRepository } from './kysely-platform.repository';
import { PlatformAuditController } from './platform-audit.controller';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformController } from './platform.controller';
import { PlatformRepository } from './platform.repository';
import { PlatformService } from './platform.service';
import { SchoolProvisioningService } from './school-provisioning.service';

@Module({
  imports: [EduvaultAuthModule, AuditModule],
  controllers: [PlatformController, PlatformAuditController],
  providers: [
    PlatformService,
    PlatformAuditService,
    SchoolProvisioningService,
    { provide: PlatformRepository, useClass: KyselyPlatformRepository },
  ],
  exports: [PlatformService],
})
export class PlatformModule {}
