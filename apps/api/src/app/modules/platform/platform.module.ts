import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { KyselyPlatformRepository } from './kysely-platform.repository';
import { PlatformController } from './platform.controller';
import { PlatformRepository } from './platform.repository';
import { PlatformService } from './platform.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [PlatformController],
  providers: [
    PlatformService,
    { provide: PlatformRepository, useClass: KyselyPlatformRepository },
  ],
  exports: [PlatformService],
})
export class PlatformModule {}
